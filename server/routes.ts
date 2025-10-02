import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import { db } from "./db";
import {
  eq,
  and,
  desc,
  sql,
  gte,
  lte,
  or,
  isNull,
  not,
  lt,
  ne,
  inArray,
} from "drizzle-orm";
import {
  posts,
  notifications,
  users,
  teams,
  groups,
  organizations,
  activities,
  workoutVideos,
  measurements,
  reactions,
  achievementTypes,
  userAchievements,
  workoutTypes,
  insertTeamSchema,
  insertGroupSchema,
  insertOrganizationSchema,
  insertPostSchema,
  insertMeasurementSchema,
  insertNotificationSchema,
  insertVideoSchema,
  insertActivitySchema,
  insertUserSchema,
  insertAchievementTypeSchema,
  insertUserAchievementSchema,
  insertWorkoutTypeSchema,
  messages,
  insertMessageSchema,
} from "@shared/schema";
import { setupAuth, authenticate } from "./auth";
import express, { Request, Response, NextFunction } from "express";
import { Server as HttpServer } from "http";
import mammoth from "mammoth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler } from "./middleware/error-handler";
import { logger } from "./logger";
import { WebSocketServer, WebSocket } from "ws";
// Object Storage routes removed - not needed
import { messageRouter } from "./message-routes";
import { userRoleRouter } from "./user-role-route";
import { groupAdminRouter } from "./group-admin-routes";

// Configure multer for memory storage (no local files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for video uploads
    fieldSize: 25 * 1024 * 1024, // 25MB per field
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

export const registerRoutes = async (
  app: express.Application,
): Promise<HttpServer> => {
  const router = express.Router();

  // Add request logging middleware
  router.use(requestLogger);

  // Add CORS headers for all requests
  router.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept",
      );
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS, PATCH",
      );
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Modify the post counts endpoint to correctly handle timezones and counts
  router.get("/api/posts/counts", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Get timezone offset from query params (in minutes)
      const tzOffset = parseInt(req.query.tzOffset as string) || 0;
      const dateParam = req.query.date
        ? new Date(req.query.date as string)
        : new Date();

      // Convert server UTC time to user's local time
      const userDate = new Date(dateParam.getTime() - tzOffset * 60000);

      // Create start and end of day in user's timezone
      const startOfDay = new Date(
        userDate.getFullYear(),
        userDate.getMonth(),
        userDate.getDate(),
      );
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // For workout and memory verse posts, we need to check the week's total
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Set to Monday
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7); // Set to next Monday

      // Add timezone offset back to get UTC times for query
      const queryStartTime = new Date(startOfDay.getTime() + tzOffset * 60000);
      const queryEndTime = new Date(endOfDay.getTime() + tzOffset * 60000);

      // Query posts for the specified date by type
      const result = await db
        .select({
          type: posts.type,
          count: sql<number>`count(*)::integer`,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, req.user.id),
            gte(posts.createdAt, queryStartTime),
            lt(posts.createdAt, queryEndTime),
            isNull(posts.parentId), // Don't count comments
            sql`${posts.type} IN ('food', 'workout', 'scripture', 'memory_verse')`, // Explicitly filter only these types
          ),
        )
        .groupBy(posts.type);

      // Get workout posts for the entire week
      const workoutWeekResult = await db
        .select({
          count: sql<number>`count(*)::integer`,
          points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, req.user.id),
            eq(posts.type, "workout"),
            gte(posts.createdAt, startOfWeek),
            lt(posts.createdAt, endOfWeek),
            isNull(posts.parentId),
          ),
        );

      const workoutWeekCount = workoutWeekResult[0]?.count || 0;
      const workoutWeekPoints = workoutWeekResult[0]?.points || 0;

      // Get memory verse posts for the week
      const memoryVerseWeekResult = await db
        .select({
          count: sql<number>`count(*)::integer`,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, req.user.id),
            eq(posts.type, "memory_verse"),
            gte(posts.createdAt, startOfWeek),
            lt(posts.createdAt, endOfWeek),
            isNull(posts.parentId),
          ),
        );

      const memoryVerseWeekCount = memoryVerseWeekResult[0]?.count || 0;

      // Initialize counts with zeros
      const counts = {
        food: 0,
        workout: 0,
        scripture: 0,
        memory_verse: 0,
        miscellaneous: 0,
      };

      // Update counts from query results
      result.forEach((row) => {
        if (row.type in counts) {
          counts[row.type as keyof typeof counts] = Number(row.count);
        }
      });

      // Define maximum posts allowed per type
      const maxPosts = {
        food: 3, // 3 meals per day
        workout: 1, // 1 workout per day
        scripture: 1, // 1 scripture per day
        memory_verse: 1, // 1 memory verse per week
        miscellaneous: Infinity, // No limit for miscellaneous posts
      };

      // Calculate remaining posts for each type
      const remaining = {
        food: Math.max(0, maxPosts.food - counts.food),
        workout: Math.max(0, maxPosts.workout - counts.workout),
        scripture: Math.max(0, maxPosts.scripture - counts.scripture),
        memory_verse: Math.max(0, maxPosts.memory_verse - counts.memory_verse),
        miscellaneous: Infinity,
      };

      // Calculate if user can post for each type
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

      const canPost = {
        food: counts.food < maxPosts.food && dayOfWeek !== 0, // No food posts on Sunday
        workout: counts.workout < maxPosts.workout && workoutWeekPoints < 15, // Limit to 15 points per week (5 workouts)
        scripture: counts.scripture < maxPosts.scripture, // Scripture posts every day
        memory_verse: memoryVerseWeekCount === 0, // One memory verse per week
        miscellaneous: true, // Always allow miscellaneous posts
      };

      res.json({
        counts,
        canPost,
        remaining,
        maxPosts,
        workoutWeekPoints,
        workoutWeekCount,
        memoryVerseWeekCount,
      });
    } catch (error) {
      logger.error("Error getting post counts:", error);
      res.status(500).json({
        message: "Failed to get post counts",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add JSON content type header for all API routes
  router.use("/api", (req, res, next) => {
    res.setHeader("Content-Type", "application/json");
    next();
  });

  // Add custom error handler for better JSON errors
  router.use(
    "/api",
    (err: any, req: Request, res: Response, next: NextFunction) => {
      logger.error("API Error:", err);
      if (!res.headersSent) {
        res.status(err.status || 500).json({
          message: err.message || "Internal server error",
          error: process.env.NODE_ENV === "development" ? err.stack : undefined,
        });
      } else {
        next(err);
      }
    },
  );

  // Enhanced ping endpoint to verify API functionality and assist with WebSocket diagnostics
  router.get("/api/ping", (req, res) => {
    logger.info("Ping request received", { requestId: req.requestId });
    res.json({
      message: "pong",
      timestamp: new Date().toISOString(),
      serverTime: new Date().toString(),
      uptime: process.uptime(),
      memoryUsage: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
        heapUsed:
          Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      },
    });
  });

  // WebSocket status endpoint to check real-time connections
  router.get("/api/ws-status", (req, res) => {
    // Count active WebSocket connections
    let totalConnections = 0;
    let activeUsers = 0;
    const userConnectionCounts: { userId: number; connections: number }[] = [];

    // Analyze the clients map
    clients.forEach((userClients, userId) => {
      const openConnections = Array.from(userClients).filter(
        (ws) => ws.readyState === WebSocket.OPEN,
      ).length;

      if (openConnections > 0) {
        activeUsers++;
        totalConnections += openConnections;

        userConnectionCounts.push({
          userId,
          connections: openConnections,
        });
      }
    });

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      websocket: {
        totalConnections,
        activeUsers,
        userDetails: userConnectionCounts,
      },
      wss: {
        clients: wss.clients.size,
      },
      serverInfo: {
        uptime: Math.floor(process.uptime()),
        startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        memoryUsage: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
          heapUsed:
            Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
        },
      },
    });
  });

  // Add a test endpoint for triggering notification checks with manual time override
  router.get("/api/test-notification", async (req, res) => {
    // Set a longer timeout for this endpoint as it can be resource-intensive
    req.setTimeout(30000); // 30 seconds timeout

    try {
      // Get specified time or use current time
      const hour = parseInt(req.query.hour as string) || new Date().getHours();
      const minute =
        parseInt(req.query.minute as string) || new Date().getMinutes();

      logger.info(
        `Manual notification test triggered with time override: ${hour}:${minute}`,
      );

      // Optional userId parameter to limit test to a specific user if needed
      // This helps reduce load for targeted testing
      const specificUserId = req.query.userId
        ? parseInt(req.query.userId as string)
        : null;

      // Get users with optimized query, limiting to specific user if provided
      let userQuery = db.select().from(users);
      if (specificUserId) {
        userQuery = userQuery.where(eq(users.id, specificUserId));
        logger.info(`Test limited to specific user ID: ${specificUserId}`);
      }
      const allUsers = await userQuery;

      // Early return if no users found
      if (allUsers.length === 0) {
        logger.info("No matching users found for test notification");
        return res.json({
          message: "No matching users found",
          totalNotifications: 0,
        });
      }

      // Keep track of notifications sent
      type SentNotification = {
        userId: number;
        username: string;
        notificationId: number;
        preferredTime: string;
        currentTime: string;
      };
      const notificationsSent: SentNotification[] = [];

      // Process in batches if needed for large user counts
      // Using Promise.all with a limited batch size prevents server overload
      const BATCH_SIZE = 10;
      for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
        const userBatch = allUsers.slice(i, i + BATCH_SIZE);

        // Process users in parallel but in limited batches
        await Promise.all(
          userBatch.map(async (user) => {
            try {
              // Skip users without notification preferences
              if (!user.notificationTime) {
                logger.info(
                  `Skipping user ${user.id} - no notification time preference set`,
                );
                return;
              }

              // Parse user's notification time preference
              const [preferredHour, preferredMinute] = user.notificationTime
                .split(":")
                .map(Number);

              // Log detailed time comparison for debugging
              logger.info(`Notification time check for user ${user.id}:`, {
                userId: user.id,
                currentTime: `${hour}:${minute}`,
                preferredTime: `${preferredHour}:${preferredMinute}`,
                notificationTime: user.notificationTime,
              });

              // Check if current time matches user's preferred notification time (with 10-minute window)
              const isPreferredTimeWindow =
                (hour === preferredHour &&
                  minute >= preferredMinute &&
                  minute < preferredMinute + 10) ||
                // Handle edge case where preferred time is near the end of an hour
                (hour === preferredHour + 1 &&
                  preferredMinute >= 50 &&
                  minute < (preferredMinute + 10) % 60);

              if (isPreferredTimeWindow) {
                // Create a test notification with proper schema references
                const notification = {
                  userId: user.id,
                  title: "Test Notification",
                  message:
                    "This is a test notification sent at your preferred time.",
                  read: false,
                  createdAt: new Date(),
                  type: "test",
                  sound: "default",
                };

                // Insert the notification
                const [createdNotification] = await db
                  .insert(notifications)
                  .values(notification)
                  .returning();

                notificationsSent.push({
                  userId: user.id,
                  username: user.username || `User ${user.id}`,
                  notificationId: createdNotification.id,
                  preferredTime: user.notificationTime,
                  currentTime: `${hour}:${minute}`,
                });

                // Send via WebSocket if user is connected
                const userClients = clients.get(user.id);
                if (userClients && userClients.size > 0) {
                  broadcastNotification(user.id, {
                    id: createdNotification.id,
                    title: notification.title,
                    message: notification.message,
                    sound: notification.sound,
                    type: notification.type,
                  });

                  logger.info(
                    `Real-time notification sent to user ${user.id} via WebSocket`,
                  );
                } else {
                  logger.info(
                    `No active WebSocket connections for user ${user.id}`,
                  );
                }
              } else {
                logger.info(
                  `User ${user.id}'s preferred time ${preferredHour}:${preferredMinute} doesn't match test time ${hour}:${minute}`,
                );
              }
            } catch (userError) {
              logger.error(
                `Error processing test notification for user ${user.id}:`,
                userError instanceof Error
                  ? userError
                  : new Error(String(userError)),
              );
            }
          }),
        );
      }

      // Set proper content type header
      res.setHeader("Content-Type", "application/json");

      // Return results - send before additional processing if needed
      res.json({
        message: `Test notification check completed for time ${hour}:${minute}`,
        notificationsSent,
        totalNotifications: notificationsSent.length,
      });
    } catch (error) {
      logger.error("Error in test notification endpoint:", error);
      res.status(500).json({
        message: "Test notification failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Protected endpoint example
  router.get("/api/protected", authenticate, (req, res) => {
    res.json({ message: "This is a protected endpoint", user: req.user?.id });
  });

  // This is a deleted route definition that will be added later in the correct order

  // Get comments for a post
  router.get("/api/posts/comments/:postId", authenticate, async (req, res) => {
    try {
      // Force JSON content type header immediately to prevent any potential HTML response
      res.set({
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
      });

      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res
          .status(400)
          .send(JSON.stringify({ message: "Invalid post ID" }));
      }

      // Get the comments
      const comments = await storage.getPostComments(postId);

      // Explicitly validate the response
      const validComments = Array.isArray(comments) ? comments : [];

      // Log the response for debugging
      logger.info(
        `Sending comments for post ${postId}: ${validComments.length} comments`,
      );

      // Double-check we're still sending as JSON (just in case)
      res.set("Content-Type", "application/json");

      // Manually stringify the JSON to ensure it's not transformed in any way
      const jsonString = JSON.stringify(validComments);

      // Send the manual JSON response
      return res.send(jsonString);
    } catch (error) {
      logger.error("Error getting comments:", error);

      // Make sure we're still sending JSON on error
      res.set("Content-Type", "application/json");

      // Return the error as a manually stringified JSON
      return res.status(500).send(
        JSON.stringify({
          message: "Failed to get comments",
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  });

  // Create a comment on a post
  router.post(
    "/api/posts/comments",
    authenticate,
    upload.single("file"),
    async (req, res) => {
      try {
        // Set content type early to prevent browser confusion
        res.setHeader("Content-Type", "application/json");

        if (!req.user) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        // Check if we have FormData or regular JSON body
        let content,
          parentId,
          depth = 0;

        if (req.body.data) {
          // FormData request - parse the JSON data
          try {
            const parsedData = JSON.parse(req.body.data);
            content = parsedData.content;
            parentId = parsedData.parentId;
            depth = parsedData.depth || 0;
          } catch (e) {
            return res
              .status(400)
              .json({ message: "Invalid JSON data in FormData" });
          }
        } else {
          // Regular JSON request
          content = req.body.content;
          parentId = req.body.parentId;
          depth = req.body.depth || 0;
        }

        logger.info("Creating comment with data:", {
          userId: req.user.id,
          parentId,
          contentLength: content ? content.length : 0,
          depth,
          hasFile: !!req.file,
        });

        if (!content || !parentId) {
          // Set JSON content type on error
          res.set("Content-Type", "application/json");
          return res.status(400).json({ message: "Missing required fields" });
        }

        // Make sure parentId is a valid number
        const parentIdNum = parseInt(parentId);
        if (isNaN(parentIdNum)) {
          // Set JSON content type on error
          res.set("Content-Type", "application/json");
          return res.status(400).json({ message: "Invalid parent post ID" });
        }

        // Process media file if present
        let commentMediaUrl = null;
        if (req.file) {
          try {
            // Use SpartaObjectStorage for file handling
            const { spartaObjectStorage } = await import("./sparta-object-storage");

            // Determine if this is a video file
            const originalFilename = req.file.originalname.toLowerCase();
            const isVideoMimetype = req.file.mimetype.startsWith("video/");
            const isVideoExtension =
              originalFilename.endsWith(".mov") ||
              originalFilename.endsWith(".mp4") ||
              originalFilename.endsWith(".webm") ||
              originalFilename.endsWith(".avi") ||
              originalFilename.endsWith(".mkv");

            const isVideo = isVideoMimetype || isVideoExtension;

            console.log(`Processing comment media file:`, {
              originalFilename: req.file.originalname,
              mimetype: req.file.mimetype,
              isVideo: isVideo,
              fileSize: req.file.size,
            });

            // Clean up the filename to avoid double timestamps
            let cleanFilename = req.file.originalname;

            // Remove any existing timestamp prefixes (pattern: TIMESTAMP-...)
            const timestampPattern = /^\d{13}-/;
            if (timestampPattern.test(cleanFilename)) {
              cleanFilename = cleanFilename.replace(timestampPattern, "");
            }

            // Remove UUID patterns from filename to make it cleaner
            const uuidPattern =
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/gi;
            cleanFilename = cleanFilename.replace(uuidPattern, "");

            // Ensure we have a valid filename
            if (!cleanFilename || cleanFilename.length < 5) {
              const ext = req.file.originalname.split(".").pop() || "jpg";
              cleanFilename = `comment-media.${ext}`;
            }

            const fileInfo = await spartaObjectStorage.storeFile(
              req.file.buffer,
              cleanFilename,
              req.file.mimetype,
              isVideo,
            );

            // Store just the storage key for the database, not the full URL
            commentMediaUrl = `shared/uploads/${fileInfo.filename}`;
            console.log(`Stored comment media file:`, { url: commentMediaUrl });
          } catch (error) {
            logger.error("Error processing comment media file:", error);
            // Continue with comment creation even if media processing fails
          }
        }

        const comment = await storage.createComment({
          userId: req.user.id,
          content,
          parentId: parentIdNum,
          depth,
          type: "comment", // Explicitly set type for comments
          points: 0, // Comments have 0 points
          mediaUrl: commentMediaUrl, // Add the media URL if a file was uploaded
        });

        // Return the created comment with author information
        const commentWithAuthor = {
          ...comment,
          author: {
            id: req.user.id,
            username: req.user.username,
            imageUrl: req.user.imageUrl,
          },
        };

        // Make sure only JSON data is sent for the response
        res.set({
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          "Content-Type": "application/json",
        });

        return res.status(201).json(commentWithAuthor);
      } catch (error) {
        logger.error("Error creating comment:", error);

        // Set JSON content type on error
        res.set("Content-Type", "application/json");

        return res.status(500).json({
          message: "Failed to create comment",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Debug endpoint for posts - unprotected for testing
  router.get("/api/debug/posts", async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.setHeader("Content-Type", "application/json");

      const userId = req.query.userId
        ? parseInt(req.query.userId as string)
        : undefined;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;
      const postType = req.query.type as string;

      logger.info(
        `Debug posts request with: userId=${userId}, startDate=${startDate}, endDate=${endDate}, type=${postType}`,
      );

      // Build the query conditions
      let conditions = [isNull(posts.parentId)]; // Start with only top-level posts

      // Add user filter if specified
      if (userId) {
        conditions.push(eq(posts.userId, userId));
      }

      // Add date range filters if specified
      if (startDate) {
        conditions.push(gte(posts.createdAt, startDate));
      }

      if (endDate) {
        // Add one day to include the entire end date
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        conditions.push(lt(posts.createdAt, nextDay));
      }

      // Add type filter if specified and not 'all'
      if (postType && postType !== "all") {
        conditions.push(eq(posts.type, postType));
      }

      // Join with users table to get author info
      const query = db
        .select({
          id: posts.id,
          content: posts.content,
          type: posts.type,
          mediaUrl: posts.mediaUrl,
          createdAt: posts.createdAt,
          parentId: posts.parentId,
          points: posts.points,
          userId: posts.userId,
          author: {
            id: users.id,
            username: users.username,
            email: users.email,
            imageUrl: users.imageUrl,
            isAdmin: users.isAdmin,
          },
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(posts.createdAt));

      const result = await query;

      logger.info(`Debug: Fetched ${result.length} posts`);
      res.json(result);
    } catch (error) {
      logger.error("Error in debug posts endpoint:", error);
      res.status(500).json({
        message: "Failed to fetch posts",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get aggregated weekly data
  router.get(
    "/api/debug/posts/weekly-stats",
    authenticate,
    async (req, res) => {
      try {
        res.setHeader("Content-Type", "application/json");

        const userId = req.query.userId
          ? parseInt(req.query.userId as string)
          : undefined;
        const startDate = req.query.startDate
          ? new Date(req.query.startDate as string)
          : undefined;
        const endDate = req.query.endDate
          ? new Date(req.query.endDate as string)
          : undefined;

        logger.info(
          `Weekly stats request with: userId=${userId}, startDate=${startDate}, endDate=${endDate}`,
        );

        if (!userId || !startDate || !endDate) {
          return res
            .status(400)
            .json({
              message:
                "Missing required parameters: userId, startDate, and endDate are required",
            });
        }

        // Convert dates to PostgreSQL date format strings
        const pgStartDate = startDate.toISOString();
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const pgEndDate = nextDay.toISOString();

        // Use SQL to calculate weekly stats directly in the database
        const weeklyStats = await db.execute(
          sql`
        SELECT 
          date_trunc('week', "createdAt") AS week_start,
          to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD') as week_label,
          SUM(points) AS total_points,
          COUNT(*) AS post_count,
          SUM(CASE WHEN type = 'food' THEN points ELSE 0 END) AS food_points,
          SUM(CASE WHEN type = 'workout' THEN points ELSE 0 END) AS workout_points,
          SUM(CASE WHEN type = 'scripture' THEN points ELSE 0 END) AS scripture_points,
          SUM(CASE WHEN type = 'memory_verse' THEN points ELSE 0 END) AS memory_verse_points,
          SUM(CASE WHEN type = 'miscellaneous' THEN points ELSE 0 END) AS misc_points
        FROM 
          posts
        WHERE 
          "userId" = ${userId} 
          AND "createdAt" >= ${pgStartDate}
          AND "createdAt" < ${pgEndDate}
          AND "parentId" IS NULL
        GROUP BY 
          date_trunc('week', "createdAt")
        ORDER BY 
          week_start DESC
        `,
        );

        // Calculate the average weekly points
        let totalPoints = 0;
        const weeks = weeklyStats.length;

        if (weeks > 0) {
          weeklyStats.forEach((week) => {
            totalPoints += parseInt(week.total_points);
          });
        }

        const averageWeeklyPoints =
          weeks > 0 ? Math.round(totalPoints / weeks) : 0;

        // Return both the weekly data and the average
        res.json({
          weeklyStats,
          averageWeeklyPoints,
          totalWeeks: weeks,
        });
      } catch (error) {
        logger.error("Error in weekly stats endpoint:", error);
        res.status(500).json({
          message: "Failed to fetch weekly stats",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Get post type distribution
  router.get(
    "/api/debug/posts/type-distribution",
    authenticate,
    async (req, res) => {
      try {
        res.setHeader("Content-Type", "application/json");

        const userId = req.query.userId
          ? parseInt(req.query.userId as string)
          : undefined;
        const startDate = req.query.startDate
          ? new Date(req.query.startDate as string)
          : undefined;
        const endDate = req.query.endDate
          ? new Date(req.query.endDate as string)
          : undefined;

        logger.info(
          `Type distribution request with: userId=${userId}, startDate=${startDate}, endDate=${endDate}`,
        );

        if (!userId || !startDate || !endDate) {
          return res
            .status(400)
            .json({
              message:
                "Missing required parameters: userId, startDate, and endDate are required",
            });
        }

        // Convert dates to PostgreSQL date format strings
        const pgStartDate = startDate.toISOString();
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const pgEndDate = nextDay.toISOString();

        // Use SQL to calculate type distribution directly in the database
        const typeDistribution = await db.execute(
          sql`
        SELECT 
          type,
          COUNT(*) AS count,
          SUM(points) AS total_points
        FROM 
          posts
        WHERE 
          "userId" = ${userId} 
          AND "createdAt" >= ${pgStartDate}
          AND "createdAt" < ${pgEndDate}
          AND "parentId" IS NULL
        GROUP BY 
          type
        ORDER BY 
          total_points DESC
        `,
        );

        // Transform the data for frontend pie chart
        const chartData = typeDistribution.map((item) => ({
          name:
            item.type.charAt(0).toUpperCase() +
            item.type.slice(1).replace("_", " "),
          value: parseInt(item.count),
          points: parseInt(item.total_points),
        }));

        res.json(chartData);
      } catch (error) {
        logger.error("Error in type distribution endpoint:", error);
        res.status(500).json({
          message: "Failed to fetch type distribution",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Main GET endpoint for fetching posts
  router.get("/api/posts", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.setHeader("Content-Type", "application/json");

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // Get filter parameters
      const userId = req.query.userId
        ? parseInt(req.query.userId as string)
        : undefined;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined;
      const postType = req.query.type as string;
      const excludeType = req.query.exclude as string;
      const teamOnly = req.query.teamOnly === "true";

      // Build the query conditions
      let conditions = [isNull(posts.parentId)]; // Start with only top-level posts

      // Add team-only filter if specified
      if (teamOnly) {
        if (!req.user.teamId) {
          // If user has no team, return empty array
          logger.info(`User ${req.user.id} has no team, returning empty posts array for team-only query`);
          return res.json([]);
        }

        // Get all users in the same team
        const teamMemberIds = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.teamId, req.user.teamId));

        const memberIds = teamMemberIds.map(member => member.id);

        if (memberIds.length === 0) {
          logger.info(`No team members found for team ${req.user.teamId}, returning empty posts array`);
          return res.json([]);
        }

        // Filter posts to only show posts from team members
        conditions.push(inArray(posts.userId, memberIds));
        logger.info(`Filtering posts for team ${req.user.teamId} with ${memberIds.length} members: ${memberIds.join(', ')}`);
      }

      // Special handling for prayer posts - filter by group instead of team
      if (postType === "prayer") {
        if (!req.user.teamId) {
          logger.info(`User ${req.user.id} has no team, returning empty prayer posts array`);
          return res.json([]);
        }

        // Get the user's group through their team
        const [userTeamData] = await db
          .select({ groupId: teams.groupId })
          .from(teams)
          .where(eq(teams.id, req.user.teamId));

        if (!userTeamData?.groupId) {
          logger.info(`User ${req.user.id}'s team has no group, returning empty prayer posts array`);
          return res.json([]);
        }

        // Find all teams in the same group
        const groupTeams = await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.groupId, userTeamData.groupId));

        const teamIds = groupTeams.map(t => t.id);

        // Find all users in those teams
        const groupUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.teamId, teamIds));

        const userIds = groupUsers.map(u => u.id);

        if (userIds.length === 0) {
          logger.info(`No users found in group ${userTeamData.groupId}, returning empty prayer posts array`);
          return res.json([]);
        }

        // Override any existing user filter for prayer posts to use group-level filtering
        conditions = conditions.filter(condition => {
          // Remove any existing userId conditions
          const conditionStr = condition.toString();
          return !conditionStr.includes('user_id') && !conditionStr.includes('userId');
        });

        // Add group-level user filtering for prayer posts
        conditions.push(inArray(posts.userId, userIds));
        logger.info(`Filtering prayer posts for group ${userTeamData.groupId} with ${userIds.length} users from ${teamIds.length} teams`);
      }

      // Add user filter if specified
      if (userId) {
        conditions.push(eq(posts.userId, userId));
      }

      // Add date range filters if specified
      if (startDate) {
        conditions.push(gte(posts.createdAt, startDate));
      }

      if (endDate) {
        // Add one day to include the entire end date
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        conditions.push(lt(posts.createdAt, nextDay));
      }

      // Add type filter if specified and not 'all'
      if (postType && postType !== "all") {
        conditions.push(eq(posts.type, postType));
      }

      // Add exclude filter if specified
      if (excludeType) {
        conditions.push(ne(posts.type, excludeType));
      }

      // Join with users table to get author info
      const query = db
        .select({
          id: posts.id,
          content: posts.content,
          type: posts.type,
          mediaUrl: posts.mediaUrl,
          createdAt: posts.createdAt,
          parentId: posts.parentId,
          points: posts.points,
          userId: posts.userId,
          author: {
            id: users.id,
            username: users.username,
            email: users.email,
            imageUrl: users.imageUrl,
            isAdmin: users.isAdmin,
          },
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(posts.createdAt));

      // Apply pagination only if not querying by date range (for analytics)
      if (!startDate && !endDate) {
        query.limit(limit).offset(offset);
      }

      const result = await query;

      logger.info(
        `Fetched ${result.length} posts with filters: userId=${userId}, startDate=${startDate}, endDate=${endDate}, type=${postType}, teamOnly=${teamOnly}`,
      );
      res.json(result);
    } catch (error) {
      logger.error("Error fetching posts:", error);
      res.status(500).json({
        message: "Failed to fetch posts",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get single post by ID - this must be placed after any more specific routes like /api/posts/comments
  router.get("/api/posts/:id", authenticate, async (req, res) => {
    try {
      // Force JSON content type header immediately to prevent any potential HTML response
      res.set({
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
      });

      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        return res
          .status(400)
          .send(JSON.stringify({ message: "Invalid post ID" }));
      }

      // Get the post with author info using a db query
      const result = await db
        .select({
          id: posts.id,
          content: posts.content,
          type: posts.type,
          mediaUrl: posts.mediaUrl,
          createdAt: posts.createdAt,
          parentId: posts.parentId,
          points: posts.points,
          userId: posts.userId,
          author: {
            id: users.id,
            username: users.username,
            email: users.email,
            imageUrl: users.imageUrl,
            isAdmin: users.isAdmin,
          },
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.id, postId))
        .limit(1);

      if (!result || result.length === 0) {
        return res
          .status(404)
          .send(JSON.stringify({ message: "Post not found" }));
      }

      const post = result[0];

      // Log the response for debugging
      logger.info(`Sending post ${postId}`);

      // Double-check we're still sending as JSON (just in case)
      res.set("Content-Type", "application/json");

      // Manually stringify the JSON to ensure it's not transformed in any way
      const jsonString = JSON.stringify(post);

      // Send the manual JSON response
      return res.send(jsonString);
    } catch (error) {
      logger.error("Error getting post:", error);

      // Make sure we're still sending JSON on error
      res.set("Content-Type", "application/json");

      // Return the error as a manually stringified JSON
      return res.status(500).send(
        JSON.stringify({
          message: "Failed to get post",
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  });

  // Get reactions for a post
  router.get("/api/posts/:postId/reactions", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.set({
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
      });

      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      const reactions = await storage.getReactionsByPost(postId);
      return res.json(reactions);
    } catch (error) {
      logger.error("Error getting reactions:", error);
      // Ensure JSON content type on error
      res.set("Content-Type", "application/json");
      return res.status(500).json({
        message: "Failed to get reactions",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add a reaction to a post
  router.post(
    "/api/posts/:postId/reactions",
    authenticate,
    async (req, res) => {
      try {
        // Set content type early to prevent browser confusion
        res.set({
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
        });

        if (!req.user) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const postId = parseInt(req.params.postId);
        if (isNaN(postId)) {
          return res.status(400).json({ message: "Invalid post ID" });
        }

        const { type } = req.body;
        if (!type) {
          return res.status(400).json({ message: "Reaction type is required" });
        }

        // Check if reaction already exists
        const existingReactions = await storage.getReactionsByPost(postId);
        const existingReaction = existingReactions.find(
          (r) => r.userId === req.user!.id && r.type === type,
        );

        if (existingReaction) {
          // If reaction exists, remove it (toggle behavior)
          await storage.deleteReaction(req.user.id, postId, type);
          return res.json({ message: "Reaction removed" });
        }

        // Create new reaction
        const reaction = await storage.createReaction({
          userId: req.user.id,
          postId,
          type,
        });

        return res.status(201).json(reaction);
      } catch (error) {
        logger.error("Error creating reaction:", error);
        // Ensure JSON content type on error
        res.set("Content-Type", "application/json");
        return res.status(500).json({
          message: "Failed to create reaction",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Delete a reaction
  router.delete(
    "/api/posts/:postId/reactions/:type",
    authenticate,
    async (req, res) => {
      try {
        // Set content type early to prevent browser confusion
        res.set({
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
        });

        if (!req.user) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const postId = parseInt(req.params.postId);
        if (isNaN(postId)) {
          return res.status(400).json({ message: "Invalid post ID" });
        }

        const { type } = req.params;

        await storage.deleteReaction(req.user.id, postId, type);

        return res.json({ message: "Reaction deleted" });
      } catch (error) {
        logger.error("Error deleting reaction:", error);
        // Ensure JSON content type on error
        res.set("Content-Type", "application/json");
        return res.status(500).json({
          message: "Failed to delete reaction",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Teams endpoints
  router.get("/api/teams", authenticate, async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error) {
      logger.error("Error fetching teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Add the missing POST endpoint for creating teams
  router.post("/api/teams", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      logger.info("Creating team with data:", req.body);

      const parsedData = insertTeamSchema.safeParse(req.body);
      if (!parsedData.success) {
        logger.error("Validation errors:", parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid team data",
          errors: parsedData.error.errors,
        });
      }

      const team = await storage.createTeam(parsedData.data);
      res.status(201).json(team);
    } catch (error) {
      logger.error("Error creating team:", error);
      res.status(500).json({
        message: "Failed to create team",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add team deletion endpoint
  router.delete("/api/teams/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const teamId = parseInt(req.params.id);
      if (isNaN(teamId)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }

      logger.info(`Deleting team ${teamId} by user ${req.user.id}`);

      // Delete the team from the database
      await db.delete(teams).where(eq(teams.id, teamId));

      // Return success response
      res.status(200).json({ message: "Team deleted successfully" });
    } catch (error) {
      logger.error(`Error deleting team ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to delete team",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update team endpoint
  router.patch("/api/teams/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const teamId = parseInt(req.params.id);
      if (isNaN(teamId)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }

      logger.info(`Updating team ${teamId} with data:`, req.body);

      // Validate the data using a partial team schema
      const updateData = req.body;

      // Update the team in the database
      const [updatedTeam] = await db
        .update(teams)
        .set(updateData)
        .where(eq(teams.id, teamId))
        .returning();

      logger.info(`Team ${teamId} updated successfully by user ${req.user.id}`);
      res.status(200).json(updatedTeam);
    } catch (error) {
      logger.error(`Error updating team ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to update team",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Organizations endpoints
  router.get("/api/organizations", authenticate, async (req, res) => {
    try {
      const organizations = await storage.getOrganizations();
      res.json(organizations);
    } catch (error) {
      logger.error("Error fetching organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  router.post("/api/organizations", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const parsedData = insertOrganizationSchema.safeParse(req.body);
      if (!parsedData.success) {
        return res.status(400).json({
          message: "Invalid organization data",
          errors: parsedData.error.errors,
        });
      }

      const organization = await storage.createOrganization(parsedData.data);
      logger.info(`Created organization: ${organization.name} by user ${req.user.id}`);
      res.status(201).json(organization);
    } catch (error) {
      logger.error("Error creating organization:", error);
      res.status(500).json({
        message: "Failed to create organization",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.delete("/api/organizations/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const organizationId = parseInt(req.params.id);
      if (isNaN(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID" });
      }

      await storage.deleteOrganization(organizationId);
      logger.info(`Deleted organization ${organizationId} by user ${req.user.id}`);
      res.status(200).json({ message: "Organization deleted successfully" });
    } catch (error) {
      logger.error(`Error deleting organization ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to delete organization",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update organization endpoint
  router.patch("/api/organizations/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const organizationId = parseInt(req.params.id);
      if (isNaN(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID" });
      }

      // Validate status field if present
      if (req.body.status !== undefined) {
        const statusSchema = z.object({ status: z.number().int().min(0).max(1) });
        const statusValidation = statusSchema.safeParse({ status: req.body.status });
        if (!statusValidation.success) {
          return res.status(400).json({ message: "Status must be 0 or 1" });
        }
      }

      logger.info(`Updating organization ${organizationId} with data:`, req.body);

      // Use database transaction for atomic updates
      const result = await db.transaction(async (tx) => {
        // Update the organization using transaction
        const [updatedOrganization] = await tx
          .update(organizations)
          .set(req.body)
          .where(eq(organizations.id, organizationId))
          .returning();

        // If organization status is being set to inactive (0), cascade to all groups, teams, and users
        if (req.body.status === 0) {
          logger.info(`Organization ${organizationId} set to inactive, cascading status updates...`);

          // Get all groups in this organization
          const orgGroups = await storage.getGroupsByOrganization(organizationId);
          const groupIds = orgGroups.map(g => g.id);

          if (groupIds.length > 0) {
            // Update all groups in this organization to inactive
            await tx.update(groups).set({ status: 0 }).where(inArray(groups.id, groupIds));
            logger.log(`Set ${groupIds.length} groups to inactive for organization ${organizationId}`);

            // Get all teams in these groups
            const teamsInGroups = await tx.select().from(teams).where(inArray(teams.groupId, groupIds));
            const teamIds = teamsInGroups.map(t => t.id);

            if (teamIds.length > 0) {
              // Update all teams in these groups to inactive
              await tx.update(teams).set({ status: 0 }).where(inArray(teams.id, teamIds));
              logger.info(`Set ${teamIds.length} teams to inactive for organization ${organizationId}`);

              // Get all users in these teams and update them to inactive
              const usersInTeams = await tx.select().from(users).where(inArray(users.teamId, teamIds));
              const userIds = usersInTeams.map(u => u.id);

              if (userIds.length > 0) {
                await tx.update(users).set({ status: 0 }).where(inArray(users.id, userIds));
                logger.info(`Set ${userIds.length} users to inactive for organization ${organizationId}`);
              }
            }
          }
        }

        return updatedOrganization;
      });

      logger.info(`Organization ${organizationId} updated successfully by user ${req.user.id}`);
      res.status(200).json(result);
    } catch (error) {
      logger.error(`Error updating organization ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to update organization",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Groups endpoints
  router.get("/api/groups", authenticate, async (req, res) => {
    try {
      const { organizationId } = req.query;

      if (organizationId) {
        const groups = await storage.getGroupsByOrganization(parseInt(organizationId as string));
        res.json(groups);
      } else {
        const groups = await storage.getGroups();
        res.json(groups);
      }
    } catch (error) {
      logger.error("Error fetching groups:", error);
      res.status(500).json({ message: "Failed to fetch groups" });
    }
  });

  router.post("/api/groups", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const parsedData = insertGroupSchema.safeParse(req.body);
      if (!parsedData.success) {
        return res.status(400).json({
          message: "Invalid group data",
          errors: parsedData.error.errors,
        });
      }

      const group = await storage.createGroup(parsedData.data);
      logger.info(`Created group: ${group.name} by user ${req.user.id}`);
      res.status(201).json(group);
    } catch (error) {
      logger.error("Error creating group:", error);
      res.status(500).json({
        message: "Failed to create group",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.delete("/api/groups/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const groupId = parseInt(req.params.id);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid group ID" });
      }

      await storage.deleteGroup(groupId);
      logger.info(`Deleted group ${groupId} by user ${req.user.id}`);
      res.status(200).json({ message: "Group deleted successfully" });
    } catch (error) {
      logger.error(`Error deleting group ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to delete group",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update group endpoint
  router.patch("/api/groups/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const groupId = parseInt(req.params.id);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid group ID" });
      }

      // Validate status field if present
      if (req.body.status !== undefined) {
        const statusSchema = z.object({ status: z.number().int().min(0).max(1) });
        const statusValidation = statusSchema.safeParse({ status: req.body.status });
        if (!statusValidation.success) {
          return res.status(400).json({ message: "Status must be 0 or 1" });
        }
      }

      logger.info(`Updating group ${groupId} with data:`, req.body);

      // Use database transaction for atomic updates
      const result = await db.transaction(async (tx) => {
        // Update the group using transaction
        const [updatedGroup] = await tx
          .update(groups)
          .set(req.body)
          .where(eq(groups.id, groupId))
          .returning();

        // If group status is being set to inactive (0), cascade to all teams and users
        if (req.body.status === 0) {
          logger.info(`Group ${groupId} set to inactive, cascading status updates...`);

          // Get all teams in this group
          const teamsInGroup = await tx.select().from(teams).where(eq(teams.groupId, groupId));
          const teamIds = teamsInGroup.map(t => t.id);

          if (teamIds.length > 0) {
            // Update all teams in this group to inactive
            await tx.update(teams).set({ status: 0 }).where(inArray(teams.id, teamIds));
            logger.info(`Set ${teamIds.length} teams to inactive for group ${groupId}`);

            // Get all users in these teams and update them to inactive
            const usersInTeams = await tx.select().from(users).where(inArray(users.teamId, teamIds));
            const userIds = usersInTeams.map(u => u.id);

            if (userIds.length > 0) {
              await tx.update(users).set({ status: 0 }).where(inArray(users.id, userIds));
              logger.info(`Set ${userIds.length} users to inactive for group ${groupId}`);
            }
          }
        }

        return updatedGroup;
      });

      logger.info(`Group ${groupId} updated successfully by user ${req.user.id}`);
      res.status(200).json(result);
    } catch (error) {
      logger.error(`Error updating group ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to update group",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Workout Types endpoints
  router.get("/api/workout-types", authenticate, async (req, res) => {
    try {
      const workoutTypes = await storage.getWorkoutTypes();
      res.json(workoutTypes);
    } catch (error) {
      logger.error("Error fetching workout types:", error);
      res.status(500).json({ message: "Failed to fetch workout types" });
    }
  });

  router.post("/api/workout-types", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const parsedData = insertWorkoutTypeSchema.safeParse(req.body);
      if (!parsedData.success) {
        return res.status(400).json({
          message: "Invalid workout type data",
          errors: parsedData.error.errors,
        });
      }

      const workoutType = await storage.createWorkoutType(parsedData.data);
      logger.info(`Created workout type: ${workoutType.type} by user ${req.user.id}`);
      res.status(201).json(workoutType);
    } catch (error) {
      logger.error("Error creating workout type:", error);
      res.status(500).json({
        message: "Failed to create workout type",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.delete("/api/workout-types/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const workoutTypeId = parseInt(req.params.id);
      if (isNaN(workoutTypeId)) {
        return res.status(400).json({ message: "Invalid workout type ID" });
      }

      await storage.deleteWorkoutType(workoutTypeId);
      logger.info(`Deleted workout type ${workoutTypeId} by user ${req.user.id}`);
      res.status(200).json({ message: "Workout type deleted successfully" });
    } catch (error) {
      logger.error(`Error deleting workout type ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to delete workout type",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.patch("/api/workout-types/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const workoutTypeId = parseInt(req.params.id);
      if (isNaN(workoutTypeId)) {
        return res.status(400).json({ message: "Invalid workout type ID" });
      }

      logger.info(`Updating workout type ${workoutTypeId} with data:`, req.body);

      const updatedWorkoutType = await storage.updateWorkoutType(workoutTypeId, req.body);

      logger.info(`Workout type ${workoutTypeId} updated successfully by user ${req.user.id}`);
      res.status(200).json(updatedWorkoutType);
    } catch (error) {
      logger.error(`Error updating workout type ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to update workout type",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Activities endpoints
  router.get("/api/activities", authenticate, async (req, res) => {
    try {
      const { week, day, weeks, activityTypeId } = req.query;

      const activityTypeIdNumber = activityTypeId ? parseInt(activityTypeId as string) : undefined;

      // If weeks parameter is provided, fetch multiple weeks efficiently
      if (weeks) {
        const weekNumbers = (weeks as string)
          .split(",")
          .map((w) => parseInt(w.trim()));
        const activities = await storage.getActivitiesForWeeks(weekNumbers, activityTypeIdNumber);
        logger.info(
          `Retrieved activities for weeks: ${weekNumbers.join(", ")}${activityTypeIdNumber ? ` with activity type: ${activityTypeIdNumber}` : ''}`,
        );
        res.json(activities);
        return;
      }

      const activities = await storage.getActivities(
        week ? parseInt(week as string) : undefined,
        day ? parseInt(day as string) : undefined,
        activityTypeIdNumber,
      );
      logger.info(`Retrieved activities${activityTypeIdNumber ? ` with activity type: ${activityTypeIdNumber}` : ''}`, { activitiesData: JSON.stringify(activities, null, 2) });
      res.json(activities);
    } catch (error) {
      logger.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  router.post("/api/activities", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      logger.info(
        "Creating/updating activity with data:",
        { activityData: JSON.stringify(req.body, null, 2) },
      );

      const parsedData = insertActivitySchema.safeParse(req.body);
      if (!parsedData.success) {
        logger.error("Validation errors:", parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid activity data",
          errors: parsedData.error.errors,
        });
      }

      logger.info(
        "Parsed activity data:",
        { parsedData: JSON.stringify(parsedData.data, null, 2) },
      );

      try {
        // Apply Bible verse conversion to the parsed data before saving to database
        if (parsedData.data.contentFields && Array.isArray(parsedData.data.contentFields)) {
          parsedData.data.contentFields = parsedData.data.contentFields.map(field => {
            if (field.type === 'text' && field.content) {
              // Only match actual Bible verses - requires book name followed by chapter:verse
              const bibleVerseRegex = /\b(?:(?:1|2|3)\s+)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|(?:1|2)\s*Samuel|(?:1|2)\s*Kings|(?:1|2)\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song\s+of\s+Songs?|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|(?:1|2)\s*Corinthians|Galatians?|Galation|Ephesians|Philippians|Colossians|(?:1|2)\s*Thessalonians|(?:1|2)\s*Timothy|Titus|Philemon|Hebrews|James|(?:1|2)\s*Peter|(?:1|2|3)\s*John|Jude|Revelation)\s+\d+:\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*\b/gi;

              const originalContent = field.content;
              field.content = field.content.replace(bibleVerseRegex, (match) => {
                // Clean up the verse reference for the URL (remove spaces, normalize common misspellings)
                const cleanVerse = match
                  .replace(/\s+/g, '')
                  .replace(/Psalms/gi, 'Psalm')
                  .replace(/Galation/gi, 'Galatians'); // Fix common misspelling

                // For mobile compatibility, use a web-based Bible app instead of bible: scheme
                // This will work in both web browsers and mobile apps
                const bibleUrl = `https://www.bible.com/search/bible?q=${encodeURIComponent(match)}`;
                return `<a href="${bibleUrl}" target="_blank" rel="noopener noreferrer">${match}</a>`;
              });

              // Don't process YouTube embeds in Bible verse content
              // YouTube embeds are already properly formatted from the client

              // Log if any Bible verses were converted
              if (originalContent !== field.content) {
                logger.info(`Bible verse conversion applied to activity Week ${parsedData.data.week}, Day ${parsedData.data.day}`);
              }
            }
            return field;
          });
        }

        // Check if an activity already exists for this week, day, AND activity type
        const existingActivity = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.week, parsedData.data.week),
              eq(activities.day, parsedData.data.day),
              eq(activities.activityTypeId, parsedData.data.activityTypeId)
            )
          )
          .limit(1);

        let activity;
        if (existingActivity.length > 0) {
          // Update existing activity
          logger.info(`Updating existing activity for Week ${parsedData.data.week}, Day ${parsedData.data.day}, Type ${parsedData.data.activityTypeId}`);
          [activity] = await db
            .update(activities)
            .set(parsedData.data)
            .where(eq(activities.id, existingActivity[0].id))
            .returning();

          res.status(200).json({
            ...activity,
            message: "Activity updated successfully"
          });
        } else {
          // Create new activity
          logger.info(`Creating new activity for Week ${parsedData.data.week}, Day ${parsedData.data.day}, Type ${parsedData.data.activityTypeId}`);
          activity = await storage.createActivity(parsedData.data);
          res.status(201).json(activity);
        }
      } catch (dbError) {
        logger.error("Database error:", dbError);
        res.status(500).json({
          message: "Failed to create/update activity in database",
          error: dbError instanceof Error ? dbError.message : "Unknown error",
        });
      }
    } catch (error) {
      logger.error("Error creating/updating activity:", error);
      res.status(500).json({
        message:
          error instanceof Error ? error.message : "Failed to create/update activity",
        error: error instanceof Error ? error.stack : "Unknown error",
      });
    }
  });

  router.put("/api/activities/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      logger.info(
        "Updating activity with data:",
        { updateData: JSON.stringify(req.body, null, 2) },
      );

      const parsedData = insertActivitySchema.safeParse(req.body);
      if (!parsedData.success) {
        logger.error("Validation errors:", parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid activity data",
          errors: parsedData.error.errors,
        });
      }

      const [activity] = await db
        .update(activities)
        .set(parsedData.data)
        .where(eq(activities.id, parseInt(req.params.id)))
        .returning();
      res.json(activity);
    } catch (error) {
      logger.error("Error updating activity:", error);
      res
        .status(500)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to update activity",
        });
    }
  });

  router.delete("/api/activities/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const activityId = parseInt(req.params.id);
      if (isNaN(activityId)) {
        return res.status(400).json({ message: "Invalid activity ID" });
      }

      await storage.deleteActivity(activityId);
      res.sendStatus(200);
    } catch (error) {
      logger.error("Error deleting activity:", error);
      res.status(500).json({
        message: "Failed to delete activity",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  });

  router.get("/api/users", authenticate, async (req, res) => {
    try {
      // Allow both full admins and group admins
      if (!req.user?.isAdmin && !req.user?.isGroupAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      let users = await storage.getAllUsers();

      // Filter users for group admins - only show users in their organization
      if (req.user.isGroupAdmin && !req.user.isAdmin && req.user.adminGroupId) {
        logger.info(`Group Admin ${req.user.id} requesting users for adminGroupId: ${req.user.adminGroupId}`);

        // Get the admin's group to find the organization
        const [adminGroup] = await db
          .select()
          .from(groups)
          .where(eq(groups.id, req.user.adminGroupId))
          .limit(1);

        if (!adminGroup) {
          logger.warn(`Admin group ${req.user.adminGroupId} not found for user ${req.user.id}`);
          return res.json([]);
        }

        logger.info(`Admin group found: ${adminGroup.name} in organization ${adminGroup.organizationId}`);

        // Get ALL teams in the same organization (across all groups)
        const orgGroups = await db
          .select({ id: groups.id })
          .from(groups)
          .where(eq(groups.organizationId, adminGroup.organizationId));

        const orgGroupIds = orgGroups.map(g => g.id);
        logger.info(`Found ${orgGroupIds.length} groups in organization ${adminGroup.organizationId}:`, orgGroupIds);

        const orgTeams = await db
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.groupId, orgGroupIds));

        const teamIds = orgTeams.map(team => team.id);
        logger.info(`Found ${teamIds.length} teams in organization ${adminGroup.organizationId}:`, teamIds);

        // Get team details for debugging
        const teamDetails = await db
          .select({
            id: teams.id,
            name: teams.name,
            groupId: teams.groupId
          })
          .from(teams)
          .where(inArray(teams.id, teamIds));
        logger.info(`Team details in organization:`, teamDetails);

        // Filter users to only those in the organization's teams
        const originalUserCount = users.length;
        const allUsersWithTeams = users.filter(user => user.teamId);
        logger.info(`Users with team assignments (before org filter):`, allUsersWithTeams.map(u => ({ id: u.id, username: u.username, teamId: u.teamId })));

        users = users.filter(user => user.teamId && teamIds.includes(user.teamId));
        logger.info(`Filtered users from ${originalUserCount} to ${users.length} for Group Admin ${req.user.id}`);
        logger.info(`Filtered user details:`, users.map(u => ({ id: u.id, username: u.username, teamId: u.teamId })));
      }

      res.json(users);
    } catch (error) {
      logger.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update the post creation endpoint to ensure correct point assignment
  router.post(
    "/api/posts",
    authenticate,
    upload.fields([
      { name: "image", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
      { name: "thumbnail_alt", maxCount: 1 },
      { name: "thumbnail_jpg", maxCount: 1 },
    ]),
    async (req, res) => {
      // Set content type early to prevent browser confusion
      res.set({
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
      });

      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      try {
        let postData = req.body;
        if (typeof postData.data === "string") {
          try {
            postData = JSON.parse(postData.data);
          } catch (parseError) {
            logger.error("Error parsing post data:", parseError);
            return res
              .status(400)
              .json({ message: "Invalid post data format" });
          }
        }

        // Calculate points based on post type
        let points = 0;
        const type = postData.type?.toLowerCase();
        switch (type) {
          case "food":
            points = 3; // 3 points per meal
            break;
          case "workout":
            points = 3; // 3 points per workout
            break;
          case "scripture":
            points = 3; // 3 points per scripture
            break;
          case "memory_verse":
            points = 10; // 10 points for memory verse
            break;
          case "miscellaneous":
          default:
            points = 0;
        }

        // Log point assignment for verification
        console.log("Assigning points:", { type, points });

        // Log point calculation for verification
        logger.info("Post points calculation:", {
          type: postData.type,
          assignedPoints: points,
        });

        // For comments, handle separately
        if (postData.type === "comment") {
          if (!postData.parentId) {
            logger.error("Missing parentId for comment");
            return res
              .status(400)
              .json({ message: "Parent post ID is required for comments" });
          }

          const post = await storage.createComment({
            userId: req.user.id,
            content: postData.content.trim(),
            parentId: postData.parentId,
            depth: postData.depth || 0,
          });
          return res.status(201).json(post);
        }

        // Handle regular post creation
        let mediaUrl = null;
        let mediaProcessed = false;
        let isVideo = false;

        // Scripture posts shouldn't have images/videos
        // Miscellaneous posts may or may not have images/videos
        if (postData.type === "scripture") {
          logger.info("Scripture post created with no media");
          mediaUrl = null;
        } else if (
          req.files &&
          (req.files as any).image &&
          (req.files as any).image[0]
        ) {
          try {
            // Get the uploaded file from the files object
            const uploadedFile = (req.files as any).image[0];

            // Handle video files differently
            isVideo = uploadedFile.mimetype.startsWith("video/");

            logger.info(
              `Processing media file: ${uploadedFile.originalname}, type: ${uploadedFile.mimetype}, isVideo: ${isVideo}`,
            );

            // Import the Object Storage utility
            const { spartaObjectStorage } = await import(
              "./sparta-object-storage-final"
            );

            // Store the file using Object Storage
            const fileInfo = await spartaObjectStorage.storeFile(
              uploadedFile.buffer,
              uploadedFile.originalname,
              uploadedFile.mimetype,
              isVideo,
            );

            // Store the full Object Storage key for proper URL construction
            mediaUrl = `shared/uploads/${fileInfo.filename}`;
            mediaProcessed = true;

            if (isVideo) {
              logger.info(`Video file stored successfully: ${fileInfo}`);
            } else {
              logger.info(`Image file stored successfully: ${fileInfo}`);
            }
          } catch (fileErr) {
            logger.error("Error processing uploaded file:", fileErr);
            // Don't use any fallback image
            mediaUrl = null;
            logger.info(
              `Error with uploaded file for post type: ${postData.type}`,
            );
          }
        } else if (
          postData.type &&
          postData.type !== "scripture" &&
          postData.type !== "miscellaneous"
        ) {
          // For miscellaneous posts, media is optional
          // For scripture posts, no media
          // For other posts, we previously would use fallbacks, but now we leave them blank
          mediaUrl = null;
          logger.info(`No media uploaded for ${postData.type} post`);
        }

        const post = await db
          .insert(posts)
          .values({
            userId: req.user!.id,
            type: postData.type,
            content: postData.content?.trim() || "",
            mediaUrl: mediaUrl,
            is_video: isVideo,
            points: points,
            createdAt: postData.createdAt
              ? new Date(postData.createdAt)
              : new Date(),
          })
          .returning()
          .then((posts) => posts[0]);

        // Log the created post for verification
        logger.info("Created post with points:", {
          postId: post.id,
          type: post.type,
          points: post.points,
        });

        // Check for achievements based on post type
        try {
          await checkForAchievements(req.user.id, post.type);
        } catch (achievementError) {
          logger.error("Error checking achievements:", achievementError);
          // Non-fatal error, continue without blocking post creation
        }

        res.status(201).json(post);
      } catch (error) {
        logger.error("Error in post creation:", error);

        // Ensure content type is still set on error
        res.set({
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
        });

        res.status(500).json({
          message:
            error instanceof Error ? error.message : "Failed to create post",
          error: error instanceof Error ? error.stack : "Unknown error",
        });
      }
    },
  );

  // Add this endpoint before the app.use(router) line
  // This endpoint has been moved to line ~3116 to support achievement_notifications_enabled

  router.delete("/api/posts/:id", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.setHeader("Content-Type", "application/json");

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the post ID as a string to handle timestamp-based IDs
      const postIdStr = req.params.id;

      // Log the raw post ID for debugging
      logger.info(`Raw post ID from request: ${postIdStr}`);

      // Validate it's a valid number
      if (!/^\d+$/.test(postIdStr)) {
        return res.status(400).json({ message: "Invalid post ID format" });
      }

      // Convert to numeric ID for database operations
      const postId = parseInt(postIdStr);

      // Use Drizzle's built-in query methods which handle parameter binding correctly
      logger.info(`Attempting to delete post ${postId} by user ${req.user.id}`);

      // Get the post to check ownership
      const [post] = await db.select().from(posts).where(eq(posts.id, postId));

      if (!post) {
        logger.info(`Post ${postId} not found during deletion attempt`);
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if user is admin or the post owner
      if (!req.user.isAdmin && post.userId !== req.user.id) {
        logger.info(
          `User ${req.user.id} not authorized to delete post ${postId} owned by ${post.userId}`,
        );
        return res
          .status(403)
          .json({ message: "Not authorized to delete this post" });
      }

      // Delete associated media files if they exist
      if (post.mediaUrl) {
        try {
          // Import the Object Storage utility
          const { spartaObjectStorage } = await import(
            "./sparta-object-storage-final"
          );

          logger.info(`Deleting file associated with post: ${post.mediaUrl}`);

          // Extract filename from mediaUrl
          let filename = "";
          if (post.mediaUrl.includes("filename=")) {
            // Handle serve-file URLs like /api/serve-file?filename=...
            const urlParams = new URLSearchParams(post.mediaUrl.split("?")[1]);
            filename = urlParams.get("filename") || "";
          } else if (post.mediaUrl.includes("storageKey=")) {
            // Handle Object Storage URLs like /api/object-storage/direct-download?storageKey=...
            const urlParams = new URLSearchParams(post.mediaUrl.split("?")[1]);
            const storageKey = urlParams.get("storageKey") || "";
            filename = storageKey.split("/").pop() || "";
          } else {
            // Handle direct paths
            filename = post.mediaUrl.split("/").pop() || "";
          }

          logger.info(`Extracted filename for deletion: ${filename}`);

          if (filename) {
            // Build the actual Object Storage path
            const filePath = `shared/uploads/${filename}`;

            // Delete the main media file
            try {
              await spartaObjectStorage.deleteFile(filePath);
              logger.info(`Deleted main media file: ${filePath}`);
            } catch (err) {
              logger.warn(
                `Could not delete main media file ${filePath}: ${err}`,
              );
            }
          }
        } catch (fileError) {
          logger.error(
            `Error deleting media file for post ${postId}:`,
            fileError,
          );
          // Continue with post deletion even if file deletion fails
        }
      }

      // Use a transaction to ensure all deletes succeed or none do
      await db.transaction(async (tx) => {
        try {
          // First delete any reactions that reference this post
          await tx.delete(reactions).where(eq(reactions.postId, postId));
          logger.info(`Deleted reactions for post ${postId}`);

          // Then delete any comments on the post
          await tx.delete(posts).where(eq(posts.parentId, postId));
          logger.info(`Deleted comments for post ${postId}`);

          // Finally delete the post itself
          await tx.delete(posts).where(eq(posts.id, postId));
          logger.info(`Post ${postId} successfully deleted`);
        } catch (txError) {
          logger.error(
            `Transaction error while deleting post ${postId}:`,
            txError,
          );
          throw txError; // Re-throw to roll back the transaction
        }
      });

      return res.status(200).json({
        message: "Post deleted successfully",
        id: postId,
      });
    } catch (error) {
      logger.error("Error deleting post:", error);
      return res.status(500).json({
        message: "Failed to delete post",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update user's preferred name
  router.patch("/api/user/preferred-name", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { preferredName } = req.body;
      console.log(`Updating preferred name for user ${req.user.id} to:`, preferredName);

      // Update the user's preferred name
      const [updatedUser] = await db
        .update(users)
        .set({ preferredName: preferredName || null })
        .where(eq(users.id, req.user.id))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log("User preferred name updated successfully:", updatedUser.preferredName);

      res.json({
        message: "Preferred name updated successfully",
        preferredName: updatedUser.preferredName
      });
    } catch (error) {
      logger.error("Error updating preferred name:", error);
      res.status(500).json({
        message: "Failed to update preferred name",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.patch("/api/user/activity-type", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { activityTypeId } = req.body;
      console.log(`Updating activity type for user ${req.user.id} to:`, activityTypeId);

      // Validate activityTypeId
      if (typeof activityTypeId !== "number" || activityTypeId < 1) {
        return res.status(400).json({ message: "Activity type ID must be a positive number" });
      }

      // Verify workout type exists
      const [workoutType] = await db
        .select()
        .from(workoutTypes)
        .where(eq(workoutTypes.id, activityTypeId))
        .limit(1);

      if (!workoutType) {
        return res.status(400).json({ message: "Activity type not found" });
      }

      // Update the user's preferred activity type
      const [updatedUser] = await db
        .update(users)
        .set({ preferredActivityTypeId: activityTypeId })
        .where(eq(users.id, req.user.id))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log("User activity type updated successfully:", updatedUser.preferredActivityTypeId);

      res.json({
        message: "Activity type updated successfully",
        preferredActivityTypeId: updatedUser.preferredActivityTypeId
      });
    } catch (error) {
      logger.error("Error updating activity type:", error);
      res.status(500).json({
        message: "Failed to update activity type",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update daily score check endpoint
  // Added a GET endpoint for testing as well as the main POST endpoint
  router.get("/api/check-daily-scores", async (req, res) => {
    try {
      const userId = parseInt(req.query.userId as string);
      const tzOffset = parseInt(req.query.tzOffset as string) || 0;

      if (isNaN(userId)) {
        return res.status(400).json({ message: "User ID is required" });
      }

      logger.info(
        `Manual check daily scores for user ${userId} with timezone offset ${tzOffset}`,
      );

      // Forward to the post endpoint
      // We're creating a fake request with the necessary properties
      await checkDailyScores({ body: { userId, tzOffset } } as Request, res);
    } catch (error) {
      logger.error("Error in GET daily score check:", error);
      res.status(500).json({
        message: "Failed to check daily scores",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add the actual POST endpoint for the daily scores check
  router.post("/api/check-daily-scores", async (req, res) => {
    try {
      // This is the proper handler for incoming scheduled requests
      await checkDailyScores(req, res);
    } catch (error) {
      logger.error("Error in POST daily score check:", error);
      res.status(500).json({
        message: "Failed to check daily scores",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Main function to check daily scores
  const checkDailyScores = async (req: Request, res: Response) => {
    try {
      logger.info("Starting daily score check with request body:", req.body);

      // Get current hour and minute from request body or use current time
      const currentHour =
        req.body?.currentHour !== undefined
          ? parseInt(req.body.currentHour)
          : new Date().getHours();

      const currentMinute =
        req.body?.currentMinute !== undefined
          ? parseInt(req.body.currentMinute)
          : new Date().getMinutes();

      logger.info(
        `Check daily scores at time: ${currentHour}:${currentMinute}`,
      );

      // Get all users using a more explicit query to avoid type issues
      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          isAdmin: users.isAdmin,
          teamId: users.teamId,
          notificationTime: users.notificationTime,
        })
        .from(users);

      logger.info(
        `Found ${Array.isArray(allUsers) ? allUsers.length : 0} users to check`,
      );

      // Get yesterday's date with proper timezone handling
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const dayOfWeek = today.getDay();

      logger.info(
        `Checking points from ${yesterday.toISOString()} to ${today.toISOString()}`,
      );

      // Process each user
      for (const user of allUsers) {
        try {
          logger.info(`Processing user ${user.id} (${user.username})`);

          // Get user's posts from yesterday with detailed logging
          const userPostsResult = await db
            .select({
              points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`,
              types: sql<string[]>`array_agg(distinct ${posts.type})`,
              count: sql<number>`count(*)::integer`,
            })
            .from(posts)
            .where(
              and(
                eq(posts.userId, user.id),
                gte(posts.createdAt, yesterday),
                lt(posts.createdAt, today),
                isNull(posts.parentId), // Don't count comments
              ),
            );

          const userPosts = userPostsResult[0];
          const totalPoints = userPosts?.points || 0;
          const postTypes = userPosts?.types || [];
          const postCount = userPosts?.count || 0;

          // Expected points vary by day:
          // Monday-Friday: 15 points (9 food + 3 workout + 3 scripture)
          // Saturday: 22 points (9 food + 3 scripture + 10 memory verse)
          // Sunday: 3 points (just scripture)
          const expectedPoints =
            dayOfWeek === 6 ? 22 : dayOfWeek === 0 ? 3 : 15;

          logger.info(`User ${user.id} (${user.username}) activity:`, {
            totalPoints,
            expectedPoints,
            postTypes,
            postCount,
            dayOfWeek,
            date: yesterday.toISOString(),
          });

          // If points are less than expected, send notification
          if (totalPoints < expectedPoints) {
            // Get a more detailed breakdown of what was posted yesterday
            const postsByType = await db
              .select({
                type: posts.type,
                count: sql<number>`count(*)::integer`,
              })
              .from(posts)
              .where(
                and(
                  eq(posts.userId, user.id),
                  gte(posts.createdAt, yesterday),
                  lt(posts.createdAt, today),
                  isNull(posts.parentId), // Don't count comments
                ),
              )
              .groupBy(posts.type);

            // Create maps to track what's posted
            const counts: Record<string, number> = {
              food: 0,
              workout: 0,
              scripture: 0,
              memory_verse: 0,
            };

            // Fill in actual counts
            postsByType.forEach((post) => {
              if (post.type in counts) {
                counts[post.type] = post.count;
              }
            });

            // Determine what should have been posted yesterday
            const missedItems = [];
            const yesterdayDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Yesterday's day

            // For food, we need 3 posts every day except Sunday
            if (yesterdayDayOfWeek !== 0 && counts.food < 3) {
              missedItems.push(`${3 - counts.food} meals`);
            }

            // For workout, we need 1 per day, max 5 per week
            if (yesterdayDayOfWeek !== 0 && counts.workout < 1) {
              missedItems.push("your workout");
            }

            // For scripture, we need 1 every day
            if (counts.scripture < 1) {
              missedItems.push("your scripture reading");
            }

            // For memory verse, we need 1 on Saturday
            if (yesterdayDayOfWeek === 6 && counts.memory_verse < 1) {
              missedItems.push("your memory verse");
            }

            // Create the notification message
            let message = "";
            if (missedItems.length > 0) {
              message = "Yesterday you missed posting ";

              if (missedItems.length === 1) {
                message += missedItems[0] + ".";
              } else if (missedItems.length === 2) {
                message += missedItems[0] + " and " + missedItems[1] + ".";
              } else {
                const lastItem = missedItems.pop();
                message += missedItems.join(", ") + ", and " + lastItem + ".";
              }
            } else {
              message = `Your total points for yesterday was ${totalPoints}. You should aim for ${expectedPoints} points daily for optimal progress!`;
            }

            // Check if a reminder notification has already been sent today
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            const existingNotifications = await db
              .select()
              .from(notifications)
              .where(
                and(
                  eq(notifications.userId, user.id),
                  eq(notifications.type, "reminder"),
                  gte(notifications.createdAt, startOfToday),
                ),
              );

            // Use passed in hour/minute or current time
            // Parse user's notification time preference (HH:MM format)
            const notificationTimeParts = user.notificationTime
              ? user.notificationTime.split(":")
              : ["9", "00"];
            const preferredHour = parseInt(notificationTimeParts[0]);
            const preferredMinute = parseInt(notificationTimeParts[1] || "0");

            // Check if we're within a 10-minute window of the user's preferred time
            const isPreferredTimeWindow =
              (currentHour === preferredHour &&
                currentMinute >= preferredMinute &&
                currentMinute < preferredMinute + 10) ||
              // Handle edge case where preferred time is near the end of an hour
              (currentHour === preferredHour + 1 &&
                preferredMinute >= 50 &&
                currentMinute < (preferredMinute + 10) % 60);

            logger.info(`Notification time check for user ${user.id}:`, {
              userId: user.id,
              currentTime: `${currentHour}:${currentMinute}`,
              preferredTime: `${preferredHour}:${preferredMinute}`,
              isPreferredTimeWindow,
              existingNotificationsToday: existingNotifications.length,
            });

            // Only send if within time window and no notifications sent today
            if (existingNotifications.length === 0 && isPreferredTimeWindow) {
              const notification = {
                userId: user.id,
                title: "Daily Reminder",
                message,
                read: false,
                createdAt: new Date(),
                type: "reminder",
                sound: "default", // Add sound property for mobile notifications
              };

              const [insertedNotification] = await db
                .insert(notifications)
                .values(notification)
                .returning();

              logger.info(`Created notification for user ${user.id}:`, {
                notificationId: insertedNotification.id,
                userId: user.id,
                message: notification.message,
              });

              // Send via WebSocket if user is connected
              const userClients = clients.get(user.id);
              if (userClients && userClients.size > 0) {
                const notificationData = {
                  id: insertedNotification.id,
                  title: notification.title,
                  message: notification.message,
                  sound: notification.sound,
                  type: notification.type,
                };

                broadcastNotification(user.id, notificationData);
              }
            } else {
              logger.info(
                `Skipping notification for user ${user.id} - already sent today`,
                {
                  userId: user.id,
                  existingNotifications: existingNotifications.length,
                },
              );
            }
          } else {
            logger.info(
              `No notification needed for user ${user.id}, met daily goal`,
            );
          }
        } catch (userError) {
          logger.error(`Error processing user ${user.id}:`, userError);
          continue; // Continue with next user even if one fails
        }
      }

      res.json({ message: "Daily score check completed" });
    } catch (error) {
      logger.error("Error in daily score check:", error);
      res.status(500).json({
        message: "Failed to check daily scores",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Add activity progress endpoint before the return statement
  router.get("/api/activities/current", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Get timezone offset from query params (in minutes)
      const tzOffset = parseInt(req.query.tzOffset as string) || 0;

      // Helper function to convert UTC date to user's local time
      const toUserLocalTime = (utcDate: Date): Date => {
        const localDate = new Date(utcDate.getTime());
        localDate.setMinutes(localDate.getMinutes() - tzOffset);
        return localDate;
      };

      // Get user's team join date
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!user?.teamJoinedAt) {
        return res.status(400).json({ message: "User has no team join date" });
      }

      // Get current time in user's timezone
      const utcNow = new Date();
      const userLocalNow = toUserLocalTime(utcNow);

      // Calculate the first Monday after joining the team
      const teamJoinLocalTime = toUserLocalTime(new Date(user.teamJoinedAt));
      const teamJoinDate = new Date(teamJoinLocalTime);
      teamJoinDate.setHours(0, 0, 0, 0);

      // Find the first Monday after the team join date
      const programStartDate = new Date(teamJoinDate);
      const daysUntilMonday = (8 - programStartDate.getDay()) % 7; // Days until next Monday (0 if already Monday)
      if (daysUntilMonday === 0 && programStartDate.getTime() === teamJoinDate.getTime()) {
        // If they joined on a Monday, start the following Monday
        programStartDate.setDate(programStartDate.getDate() + 7);
      } else {
        programStartDate.setDate(programStartDate.getDate() + daysUntilMonday);
      }

      // Get start of current day in user's timezone
      const currentStartOfDay = new Date(userLocalNow);
      currentStartOfDay.setHours(0, 0, 0, 0);

      // Check if the program has started yet
      const programHasStarted = currentStartOfDay.getTime() >= programStartDate.getTime();

      if (!programHasStarted) {
        // Program hasn't started yet
        const daysToProgramStart = Math.ceil(
          (programStartDate.getTime() - currentStartOfDay.getTime()) / (1000 * 60 * 60 * 24)
        );

        console.log("Program Not Started:", {
          timezone: `UTC${tzOffset >= 0 ? "+" : ""}${-tzOffset / 60}`,
          userLocalNow: userLocalNow.toLocaleString(),
          teamJoinedAt: user.teamJoinedAt,
          teamJoinLocalTime: teamJoinLocalTime.toLocaleString(),
          programStartDate: programStartDate.toLocaleString(),
          daysToProgramStart,
          programHasStarted: false,
        });

        return res.json({
          currentWeek: null,
          currentDay: null,
          daysSinceStart: null,
          progressDays: null,
          programHasStarted: false,
          programStartDate: programStartDate.toISOString(),
          daysToProgramStart,
          debug: {
            timezone: `UTC${tzOffset >= 0 ? "+" : ""}${-tzOffset / 60}`,
            localTime: userLocalNow.toLocaleString(),
            teamJoinedLocal: teamJoinLocalTime.toLocaleString(),
            programStartLocal: programStartDate.toLocaleString(),
          },
        });
      }

      // Calculate days since program started
      const daysSinceProgramStart = Math.floor(
        (currentStartOfDay.getTime() - programStartDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate current week and day based on program progress
      const weekNumber = Math.floor(daysSinceProgramStart / 7) + 1;
      const rawDay = userLocalNow.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const dayNumber = rawDay === 0 ? 7 : rawDay; // Convert to 1 = Monday, ..., 7 = Sunday

      // Debug info
      console.log("Program Started - Date Calculations:", {
        timezone: `UTC${tzOffset >= 0 ? "+" : ""}${-tzOffset / 60}`,
        utcNow: utcNow.toISOString(),
        userLocalNow: userLocalNow.toLocaleString(),
        teamJoinedAt: user.teamJoinedAt,
        teamJoinLocalTime: teamJoinLocalTime.toLocaleString(),
        programStartDate: programStartDate.toLocaleString(),
        daysSinceProgramStart,
        weekNumber,
        dayNumber,
        programHasStarted: true,
      });

      res.json({
        currentWeek: weekNumber,
        currentDay: dayNumber,
        daysSinceStart: daysSinceProgramStart,
        progressDays: daysSinceProgramStart,
        programHasStarted: true,
        programStartDate: programStartDate.toISOString(),
        debug: {
          timezone: `UTC${tzOffset >= 0 ? "+" : ""}${-tzOffset / 60}`,
          localTime: userLocalNow.toLocaleString(),
          teamJoinedLocal: teamJoinLocalTime.toLocaleString(),
          programStartLocal: programStartDate.toLocaleString(),
        },
      });
    } catch (error) {
      logger.error("Error calculating activity dates:", error);
      res.status(500).json({
        message: "Failed to calculate activity dates",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Measurements endpoints
  router.post("/api/measurements", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      logger.info("Creating measurement with data:", req.body);

      const parsedData = insertMeasurementSchema.safeParse({
        ...req.body,
        userId: req.user.id,
        date: new Date(),
      });

      if (!parsedData.success) {
        logger.error("Validation errors:", parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid measurement data",
          errors: parsedData.error.errors,
        });
      }

      const measurement = await db
        .insert(measurements)
        .values(parsedData.data)
        .returning();

      res.status(201).json(measurement[0]);
    } catch (error) {
      logger.error("Error creating measurement:", error);
      res.status(500).json({
        message: "Failed to create measurement",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/api/measurements", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userId = req.query.userId
        ? parseInt(req.query.userId as string)
        : req.user.id;

      if (req.user.id !== userId && !req.user.isAdmin) {
        return res
          .status(403)
          .json({ message: "Not authorized to view these measurements" });
      }

      const userMeasurements = await db
        .select()
        .from(measurements)
        .where(eq(measurements.userId, userId))
        .orderBy(desc(measurements.date));

      res.json(userMeasurements);
    } catch (error) {
      logger.error("Error fetching measurements:", error);
      res.status(500).json({
        message: "Failed to fetch measurements",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add daily points endpoint with corrected calculation and improved logging
  router.get("/api/points/daily", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Parse the date more carefully to handle timezone issues
      let dateStr = (req.query.date as string) || new Date().toISOString();

      // If the date doesn't include time, add a default time
      if (dateStr.indexOf("T") === -1) {
        dateStr = `${dateStr}T00:00:00.000Z`;
      }

      const date = new Date(dateStr);
      const userId = parseInt(req.query.userId as string);

      if (isNaN(userId)) {
        logger.error(`Invalid userId: ${req.query.userId}`);
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Normalize to beginning of day in UTC to ensure consistent date handling
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);

      // Log request parameters for debugging
      logger.info(
        `Calculating points for user ${userId} on date ${date.toISOString()}`,
        {
          requestedDate: dateStr,
          normalizedStartDate: startOfDay.toISOString(),
          normalizedEndDate: endOfDay.toISOString(),
        },
      );

      // Calculate total points for the day with detailed logging
      const result = await db
        .select({
          points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfDay),
            lt(posts.createdAt, endOfDay),
            isNull(posts.parentId), // Don't count comments in the total
          ),
        );

      // Get post details for debugging
      const postDetails = await db
        .select({
          id: posts.id,
          type: posts.type,
          points: posts.points,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfDay),
            lt(posts.createdAt, endOfDay),
            isNull(posts.parentId),
          ),
        );

      const totalPoints = result[0]?.points || 0;

      // Log the response details
      logger.info(`Daily points for user ${userId}: ${totalPoints}`, {
        date: date.toISOString(),
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString(),
        postCount: postDetails.length,
        posts: JSON.stringify(postDetails),
      });

      // Ensure content type is set
      res.setHeader("Content-Type", "application/json");
      res.json({ points: totalPoints });
    } catch (error) {
      logger.error("Error calculating daily points:", error);
      res.status(500).json({
        message: "Failed to calculate daily points",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add notifications count endpoint
  router.get("/api/notifications/unread", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const unreadCount = await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, req.user.id),
            eq(notifications.read, false),
          ),
        );

      res.json({ unreadCount: unreadCount[0].count });
    } catch (error) {
      logger.error("Error fetching unread notifications:", error);
      res.status(500).json({
        message: "Failed to fetch notification count",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Mark notifications as read
  router.post("/api/notifications/read", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { notificationIds } = req.body;

      if (!Array.isArray(notificationIds)) {
        return res.status(400).json({ message: "Invalid notification IDs" });
      }

      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.userId, req.user.id),
            sql`${notifications.id} = ANY(${notificationIds})`,
          ),
        );

      res.json({ message: "Notifications marked as read" });
    } catch (error) {
      logger.error("Error marking notifications as read:", error);
      res.status(500).json({
        message: "Failed to mark notifications as read",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get user notifications
  router.get("/api/notifications", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.user.id))
        .orderBy(desc(notifications.createdAt));

      res.json(userNotifications);
    } catch (error) {
      logger.error("Error fetching notifications:", error);
      res.status(500).json({
        message: "Failed to fetch notifications",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.patch("/api/users/:userId", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID format" });
      }

      // Validate teamId if present
      if (req.body.teamId !== undefined && req.body.teamId !== null) {
        if (typeof req.body.teamId !== "number") {
          return res.status(400).json({ message: "Team ID must be a number" });
        }
        // Verify team exists
        const [team] = await db
          .select()
          .from(teams)
          .where(eq(teams.id, req.body.teamId))
          .limit(1);

        if (!team) {
          return res.status(400).json({ message: "Team not found" });
        }
      }

      // Prepare update data - explicitly handle falsy values like status=0
      const updateData: any = { ...req.body };

      // Fix teamJoinedAt logic to handle teamId=0 properly
      if (req.body.teamId !== undefined) {
        updateData.teamJoinedAt = req.body.teamId !== null && req.body.teamId !== 0 ? new Date() : null;
      }

      logger.info(`PATCH /api/users/${userId} - Request body:`, JSON.stringify(req.body));
      logger.info(`PATCH /api/users/${userId} - Update data:`, JSON.stringify(updateData));

      // Use database transaction for atomic updates
      const updatedUser = await db.transaction(async (tx) => {
        const [result] = await tx
          .update(users)
          .set(updateData)
          .where(eq(users.id, userId))
          .returning();

        if (!result) {
          throw new Error("User not found");
        }

        logger.info(`PATCH /api/users/${userId} - Database result:`, JSON.stringify(result));
        return result;
      });

      logger.info(`User ${userId} updated successfully by admin ${req.user.id}`);

      // Return sanitized user data
      res.setHeader("Content-Type", "application/json");
      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        teamId: updatedUser.teamId,
        isAdmin: updatedUser.isAdmin,
        isTeamLead: updatedUser.isTeamLead,
        imageUrl: updatedUser.imageUrl,
        teamJoinedAt: updatedUser.teamJoinedAt,
        status: updatedUser.status,
      });
    } catch (error) {
      logger.error("Error updating user:", error);
      res.status(500).json({
        message: "Failed to update user",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post(
    "/api/notifications/:notificationId/read",
    authenticate,
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" });

        const notificationId = parseInt(req.params.notificationId);
        if (isNaN(notificationId)) {
          return res.status(400).json({ message: "Invalid notification ID" });
        }

        // Set content type before sending response
        res.setHeader("Content-Type", "application/json");

        const [updatedNotification] = await db
          .update(notifications)
          .set({ read: true })
          .where(
            and(
              eq(notifications.userId, req.user.id),
              eq(notifications.id, notificationId),
            ),
          )
          .returning();

        if (!updatedNotification) {
          return res.status(404).json({ message: "Notification not found" });
        }

        res.json({
          message: "Notification marked as read",
          notification: updatedNotification,
        });
      } catch (error) {
        logger.error("Error marking notification as read:", error);
        res.status(500).json({
          message: "Failed to mark notification as read",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Add messages endpoints before return statement
  router.post(
    "/api/messages",
    authenticate,
    upload.single("image"),
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" });

        const { content, recipientId } = req.body;

        // Validate recipient exists
        const [recipient] = await db
          .select()
          .from(users)
          .where(eq(users.id, parseInt(recipientId)))
          .limit(1);

        if (!recipient) {
          return res.status(404).json({ message: "Recipient not found" });
        }

        // Create message
        const [message] = await db
          .insert(messages)
          .values({
            senderId: req.user.id,
            recipientId: parseInt(recipientId),
            content: content || null,
            imageUrl: null, // FIXED: Using message-routes.ts for Object Storage instead
            isRead: false,
          })
          .returning();

        // Create notification for recipient
        await db.insert(notifications).values({
          userId: parseInt(recipientId),
          title: "New Message",
          message: `You have a new message from ${req.user.username}`,
          read: false,
        });

        res.status(201).json(message);
      } catch (error) {
        logger.error("Error creating message:", error);
        res.status(500).json({
          message: "Failed to create message",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Get messages between users
  router.get("/api/messages/:userId", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const otherUserId = parseInt(req.params.userId);
      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const userMessages = await db
        .select({
          id: messages.id,
          content: messages.content,
          imageUrl: messages.imageUrl,
          createdAt: messages.createdAt,
          isRead: messages.isRead,
          sender: {
            id: users.id,
            username: users.username,
            imageUrl: users.imageUrl,
          },
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(
          or(
            and(
              eq(messages.senderId, req.user.id),
              eq(messages.recipientId, otherUserId),
            ),
            and(
              eq(messages.senderId, otherUserId),
              eq(messages.recipientId, req.user.id),
            ),
          ),
        )
        .orderBy(messages.createdAt);

      res.json(userMessages);
    } catch (error) {
      logger.error("Error fetching messages:", error);
      res.status(500).json({
        message: "Failed to fetch messages",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get unread messages count
  router.get("/api/messages/unread/count", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const [result] = await db
        .select({
          count: sql<number>`count(*)::integer`,
        })
        .from(messages)
        .where(
          and(
            eq(messages.recipientId, req.user.id),
            eq(messages.isRead, false),
          ),
        );

      res.json({ unreadCount: result.count });
    } catch (error) {
      logger.error("Error getting unread message count:", error);
      res.status(500).json({
        message: "Failed to get unread message count",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Mark messages as read
  router.post("/api/messages/read", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { senderId } = req.body;
      if (!senderId) {
        return res.status(400).json({ message: "Sender ID is required" });
      }

      await db
        .update(messages)
        .set({ isRead: true })
        .where(
          and(
            eq(messages.recipientId, req.user.id),
            eq(messages.senderId, parseInt(senderId)),
            eq(messages.isRead, false),
          ),
        );

      res.json({ message: "Messages marked as read" });
    } catch (error) {
      logger.error("Error marking messages as read:", error);
      res.status(500).json({
        message: "Failed to mark messages as read",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add messages endpoints before statement
  router.get(
    "/api/messages/unread/by-sender",
    authenticate,
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" });

        // Get all senders who have sent unread messages to the current user
        const unreadBySender = await db
          .select({
            senderId: messages.senderId,
            hasUnread: sql<boolean>`true`,
          })
          .from(messages)
          .where(
            and(
              eq(messages.recipientId, req.user.id),
              eq(messages.isRead, false),
            ),
          )
          .groupBy(messages.senderId);

        // Convert to a map of senderId -> hasUnread
        const unreadMap = Object.fromEntries(
          unreadBySender.map(({ senderId }) => [senderId, true]),
        );

        res.json(unreadMap);
      } catch (error) {
        logger.error("Error getting unread messages by sender:", error);
        res.status(500).json({
          message: "Failed to get unread messages by sender",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Add thumbnail generation endpoint
  router.post("/api/generate-thumbnail", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { videoUrl } = req.body;

      if (!videoUrl) {
        return res.status(400).json({ message: "Video URL is required" });
      }

      console.log("Thumbnail generation requested for:", videoUrl);

      // Extract filename from the video URL
      let filename = "";
      if (videoUrl.includes("filename=")) {
        const urlParams = new URLSearchParams(videoUrl.split("?")[1]);
        filename = urlParams.get("filename") || "";
      } else {
        filename = videoUrl.split("/").pop() || "";
      }

      if (!filename) {
        return res
          .status(400)
          .json({ message: "Could not extract filename from video URL" });
      }

      try {
        // Import the simplified MOV frame extractor
        const { createMovThumbnail } = await import(
          "./mov-frame-extractor-new"
        );

        // Use Object Storage client
        const { Client } = await import("@replit/object-storage");
        const objectStorage = new Client();

        // Download the video file temporarily to extract thumbnail
        const videoKey = filename.startsWith("shared/")
          ? filename
          : `shared/uploads/${filename}`;
        console.log(
          `Attempting to download video from Object Storage: ${videoKey}`,
        );

        const videoResult = await objectStorage.downloadFile(videoKey);

        // Handle Object Storage response format
        let videoBuffer: Buffer;
        if (Buffer.isBuffer(videoResult)) {
          videoBuffer = videoResult;
        } else if (videoResult && typeof videoResult === "object") {
          if ("value" in videoResult && videoResult.value) {
            if (Buffer.isBuffer(videoResult.value)) {
              videoBuffer = videoResult.value;
            } else if (Array.isArray(videoResult.value)) {
              videoBuffer = Buffer.from(videoResult.value);
            } else if (typeof videoResult.value === "string") {
              videoBuffer = Buffer.from(videoResult.value, "base64");
            } else {
              throw new Error("Invalid video data format from Object Storage");
            }
          } else if ("ok" in videoResult && !videoResult.ok) {
            throw new Error(
              `Video file not found in Object Storage: ${videoKey}`,
            );
          } else {
            throw new Error("Unexpected Object Storage response format");
          }
        } else {
          throw new Error("Could not retrieve video data from Object Storage");
        }

        console.log(
          `Successfully downloaded video buffer, size: ${videoBuffer.length} bytes`,
        );

        // Write video to temporary file for thumbnail extraction
        const fs = await import("fs");
        const path = await import("path");
        const tempDir = path.join(process.cwd(), "temp");

        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempVideoPath = path.join(tempDir, filename);
        fs.writeFileSync(tempVideoPath, videoBuffer);
        console.log(`Written video to temporary file: ${tempVideoPath}`);

        try {
          // Generate thumbnail using the simplified extractor
          const thumbnailFilename = await createMovThumbnail(tempVideoPath);

          if (thumbnailFilename) {
            console.log(
              `Thumbnail generated successfully: ${thumbnailFilename}`,
            );

            // Clean up temporary video file
            fs.unlinkSync(tempVideoPath);

            res.json({
              success: true,
              thumbnailUrl: `/api/serve-file?filename=${thumbnailFilename}`,
              message: "Thumbnail generated successfully",
            });
          } else {
            throw new Error("Thumbnail generation failed - no file created");
          }
        } catch (extractError) {
          // Clean up temp video file
          if (fs.existsSync(tempVideoPath)) {
            fs.unlinkSync(tempVideoPath);
          }
          throw extractError;
        }
      } catch (error) {
        logger.error("Error generating thumbnail:", error);
        return res.status(500).json({
          message: "Failed to generate thumbnail",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } catch (error) {
      logger.error("Error in thumbnail generation endpoint:", error);
      res.status(500).json({
        message: "Failed to process thumbnail request",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add this endpoint before the app.use(router) line
  // Get current user data
  router.get("/api/users/me", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Query for user data including notification preferences
      const [userData] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id));

      if (!userData) {
        return res.status(404).json({ message: "User not found" });
      }

      // Send back the user data
      res.json(userData);
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Submit waiver signature
  router.post("/api/users/waiver", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { signature, agreedAt } = req.body;

      if (!signature) {
        return res.status(400).json({ message: "Signature is required" });
      }

      // Update user's waiver status
      const [updatedUser] = await db
        .update(users)
        .set({
          waiverSigned: true,
          waiverSignedAt: new Date(agreedAt),
          waiverSignature: signature,
        })
        .where(eq(users.id, req.user.id))
        .returning();

      logger.info(`User ${req.user.id} signed waiver at ${agreedAt}`);

      res.json({
        message: "Waiver signed successfully",
        waiverSigned: true,
        waiverSignedAt: updatedUser.waiverSignedAt,
      });
    } catch (error) {
      logger.error("Error submitting waiver:", error);
      res.status(500).json({
        message: "Failed to submit waiver",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post(
    "/api/users/notification-schedule",
    authenticate,
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" });

        const { notificationTime, achievementNotificationsEnabled } = req.body;
        // Define update data with proper typing
        const updateData: {
          notificationTime?: string;
          achievementNotificationsEnabled?: boolean;
        } = {};

        // Add notification time if provided
        if (notificationTime !== undefined) {
          // Validate time format (HH:mm)
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(notificationTime)) {
            return res
              .status(400)
              .json({ message: "Invalid time format. Use HH:mm format." });
          }
          updateData.notificationTime = notificationTime;
        }

        // Add achievement notifications enabled setting if provided
        if (achievementNotificationsEnabled !== undefined) {
          updateData.achievementNotificationsEnabled =
            achievementNotificationsEnabled;
        }

        // Update user notification preferences
        const [updatedUser] = await db
          .update(users)
          .set(updateData)
          .where(eq(users.id, req.user.id))
          .returning();

        res.json(updatedUser);
      } catch (error) {
        logger.error("Error updating notification schedule:", error);
        res.status(500).json({
          message: "Failed to update notification schedule",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Register message routes first (with Object Storage implementation)
  app.use(messageRouter);

  // Register user role routes
  app.use(userRoleRouter);
  app.use(groupAdminRouter);

  app.use(router);

  // Create HTTP server
  const httpServer = createServer(app);

  // Create WebSocket server on a distinct path
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });

  // Map to store active client connections by user ID
  const clients = new Map<number, Set<WebSocket>>();

  // Handle WebSocket connections
  wss.on("connection", (ws: WebSocket) => {
    console.log("WebSocket client connected at", new Date().toISOString());
    logger.info("WebSocket client connected");
    let userId: number | null = null;
    let pingTimeout: NodeJS.Timeout | null = null;

    // Set custom properties to track socket health
    (ws as any).isAlive = true;
    (ws as any).lastPingTime = Date.now();
    (ws as any).userId = null;

    // Send an immediate connection confirmation
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(
          JSON.stringify({
            type: "connected",
            message: "Connection established with server",
            timestamp: Date.now(),
          }),
        );
        console.log("Sent connection confirmation message to client");
      } catch (err) {
        console.error("Error sending connection confirmation:", err);
      }
    }

    // Function to keep connections alive with ping/pong pattern
    const heartbeat = () => {
      (ws as any).isAlive = true;
      (ws as any).lastPingTime = Date.now();

      // Clear existing timeout
      if (pingTimeout) {
        clearTimeout(pingTimeout);
      }

      // Set a much longer timeout to avoid premature disconnections
      pingTimeout = setTimeout(() => {
        logger.warn(`WebSocket connection timed out after no response for 120s, userId: ${userId || 'unauthenticated'}`);
        ws.terminate();
      }, 120000); // 2 minutes timeout instead of 30 seconds
    };

    // Start the heartbeat immediately on connection
    heartbeat();

    ws.on("message", async (message) => {
      try {
        // Reset the heartbeat on any message
        heartbeat();

        const data = JSON.parse(message.toString());

        // Handle pong message (response to our ping)
        if (data.type === "pong") {
          // Client responded to our ping, update alive status
          (ws as any).isAlive = true;
          (ws as any).lastPongTime = Date.now();

          // Calculate round-trip time if we have both ping and pong timestamps
          if (data.pingTimestamp) {
            const roundTripTime = Date.now() - data.pingTimestamp;
            if (roundTripTime > 5000) {
              // Log only if latency is high (over 5 seconds)
              logger.warn(
                `High WebSocket latency detected for user ${userId}: ${roundTripTime}ms`,
              );
            }
          }
          return;
        }

        // Handle authentication message
        if (data.type === "auth") {
          userId = parseInt(data.userId);
          if (isNaN(userId)) {
            ws.send(
              JSON.stringify({ type: "error", message: "Invalid user ID" }),
            );
            return;
          }

          // Store userId on the socket for easier debugging
          (ws as any).userId = userId;

          // Add client to the user's connections
          if (!clients.has(userId)) {
            clients.set(userId, new Set());
          }

          // Add to the clients map, but first check if there are too many connections
          const userClients = clients.get(userId);
          if (userClients && userClients.size >= 10) {
            // If there are too many connections for this user, close the oldest ones
            logger.warn(
              `User ${userId} has too many WebSocket connections (${userClients.size}), closing oldest`,
            );

            // Sort connections by last activity time and close the oldest ones
            const oldConnections = Array.from(userClients)
              .filter((client) => (client as any).lastPingTime)
              .sort((a, b) => (a as any).lastPingTime - (b as any).lastPingTime)
              .slice(0, userClients.size - 8); // Keep the 8 newest connections

            // Close the old connections
            for (const oldClient of oldConnections) {
              try {
                userClients.delete(oldClient);
                oldClient.close(1000, "Too many connections for this user");
              } catch (err) {
                logger.error(
                  `Error closing old connection: ${err}`,
                  Error(String(err)),
                );
              }
            }
          }

          userClients?.add(ws);

          logger.info(
            `WebSocket user ${userId} authenticated with ${userClients?.size || 0} total connections`,
          );
          ws.send(JSON.stringify({ type:"auth_success", userId }));
        }

        // Handle ping from client (different from our server-initiated ping)
        if (data.type === "ping") {
          // Client is checking if we're still alive, respond with pong
          ws.send(
            JSON.stringify({
              type: "pong",
              timestamp: Date.now(),
              receivedAt: data.timestamp,
            }),
          );
        }
      } catch (error) {
        logger.error(
          "WebSocket message error:",
          error instanceof Error ? error : new Error(String(error)),
        );

        try {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message format",
            }),
          );
        } catch (sendErr) {
          logger.error(
            "Error sending error message to client:",
            sendErr instanceof Error ? sendErr : new Error(String(sendErr)),
          );
          // If we can't send a message, the connection might be dead
          ws.terminate();
        }
      }
    });

    // Handle client disconnection
    ws.on("close", () => {
      // Clear the ping timeout
      if (pingTimeout) {
        clearTimeout(pingTimeout);
        pingTimeout = null;
      }

      if (userId) {
        const userClients = clients.get(userId);
        if (userClients) {
          userClients.delete(ws);
          logger.info(
            `WebSocket client disconnected for user ${userId}, remaining connections: ${userClients.size}`,
          );

          if (userClients.size === 0) {
            clients.delete(userId);
            logger.info(
              `No more connections for user ${userId}, removed from clients map`,
            );
          }
        }
      } else {
        logger.info("Unauthenticated WebSocket client disconnected");
      }
    });

    // Handle connection errors
    ws.on('error', (err) => {
      // Only log non-routine connection errors
      if (!err.message.includes('ECONNRESET') && !err.message.includes('EPIPE')) {
        logger.error(`WebSocket error for user ${userId || 'unauthenticated'}:`, err instanceof Error ? err : new Error(String(err)));
      }

      // Clear the ping timeout
      if (pingTimeout) {
        clearTimeout(pingTimeout);
        pingTimeout = null;
      }

      // Don't force terminate on error - let natural close handling take care of cleanup

      // Make sure to clean up client map
      if (userId) {
        const userClients = clients.get(userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(userId);
          }
        }
      }
    });

    // We've already sent a connection message above, no need to send again
  });

  // Add a function to broadcast notifications to users
  const broadcastNotification = (userId: number, notification: any) => {
    const userClients = clients.get(userId);
    if (userClients && userClients.size > 0) {
      const message = JSON.stringify({
        type: "notification",
        data: notification,
      });

      userClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });

      logger.info(`Notification sent to user ${userId}`);
    }
  };

  // Expose the broadcast function to the global scope
  (app as any).broadcastNotification = broadcastNotification;

  // Start WebSocket heartbeat monitoring
  // This helps detect and clean up stale connections
  const startHeartbeatMonitoring = () => {
    logger.info("Starting WebSocket heartbeat monitoring");

    const HEARTBEAT_INTERVAL = 30000; // Check every 30 seconds

    setInterval(() => {
      let activeConnections = 0;
      let closedConnections = 0;

      // For each user in our clients map
      clients.forEach((userClients, userId) => {
        // For each connection for this user
        userClients.forEach((ws) => {
          try {
            // Skip if connection is already closed
            if (ws.readyState !== WebSocket.OPEN) {
              // Connection is not open, close and remove it
              try {
                ws.terminate();
              } catch (err) {
                logger.error(
                  `Error terminating stale connection: ${err}`,
                  Error(String(err)),
                );
              }

              userClients.delete(ws);
              closedConnections++;
              return;
            }

            // Check if the connection is stale by checking isAlive flag
            if (!(ws as any).isAlive) {
              logger.warn(`Terminating stale connection for user ${userId}`);
              try {
                ws.terminate();
              } catch (err) {
                logger.error(
                  `Error terminating stale connection: ${err}`,
                  Error(String(err)),
                );
              }

              userClients.delete(ws);
              closedConnections++;
              return;
            }

            // Mark as not alive - will be marked alive when pong is received
            (ws as any).isAlive = false;

            // Send ping
            try {
              ws.send(
                JSON.stringify({
                  type: "ping",
                  timestamp: Date.now(),
                }),
              );

              activeConnections++;
            } catch (err) {
              logger.error(`Error sending ping: ${err}`, Error(String(err)));

              // Error sending ping, connection is probably dead
              try {
                // Make sure socket's ping timeout is properly cleared through a custom attribute
                if ((ws as any).pingTimeout) {
                  clearTimeout((ws as any).pingTimeout);
                  (ws as any).pingTimeout = null;
                }

                ws.terminate();
              } catch (termErr) {
                // Ignore errors during terminate
                logger.debug(
                  `Error during terminate after ping failure: ${termErr}`,
                );
              }

              userClients.delete(ws);
              closedConnections++;
            }
          } catch (err) {
            logger.error(`Error in heartbeat: ${err}`, Error(String(err)));

            // Error in heartbeat logic, close and remove the connection
            try {
              userClients.delete(ws);
              closedConnections++;
            } catch (cleanupErr) {
              logger.error(
                `Error cleaning up connection: ${cleanupErr}`,
                Error(String(cleanupErr)),
              );
            }
          }
        });

        // Clean up user entry if no connections remain
        if (userClients.size === 0) {
          clients.delete(userId);
        }
      });

      logger.info(
        `WebSocket heartbeat complete - active: ${activeConnections}, closed: ${closedConnections}`,
      );
    }, HEARTBEAT_INTERVAL);
  };

  // Start the heartbeat monitoring
  startHeartbeatMonitoring();

  // User stats endpoint for simplified My Stats section
  router.get("/api/user/stats", authenticate, async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userId = req.user.id;

      // Get timezone offset from query params (in minutes)
      const tzOffset = parseInt(req.query.tzOffset as string) || 0;

      logger.info(
        `Stats requested for user ${userId} with timezone offset: ${tzOffset} minutes`,
      );

      // For debugging, let's see what posts this user has today in UTC
      const postsToday = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, new Date(new Date().setHours(0, 0, 0, 0))),
            lte(
              posts.createdAt,
              new Date(new Date().setHours(23, 59, 59, 999)),
            ),
          ),
        );

      logger.info(
        `Posts for user ${userId} today in UTC: ${postsToday.length}`,
      );

      // Calculate the local date for the user based on their timezone
      const now = new Date();
      // First convert to UTC by removing the local timezone offset
      const utcTime = now.getTime();
      // Then adjust to user's local time by applying their timezone offset (reversed since getTimezoneOffset returns the opposite)
      const userLocalTime = new Date(utcTime - tzOffset * 60000);

      logger.info(
        `User's local time (${userId}): ${userLocalTime.toISOString()}`,
      );

      // Use this adjusted date to create proper day boundaries in the user's local timezone
      const startOfDay = new Date(
        userLocalTime.getFullYear(),
        userLocalTime.getMonth(),
        userLocalTime.getDate(),
        0,
        0,
        0,
        0,
      );
      // Convert back to UTC for database query
      const startOfDayUTC = new Date(startOfDay.getTime() + tzOffset * 60000);

      const endOfDay = new Date(
        userLocalTime.getFullYear(),
        userLocalTime.getMonth(),
        userLocalTime.getDate(),
        23,
        59,
        59,
        999,
      );
      // Convert back to UTC for database query
      const endOfDayUTC = new Date(endOfDay.getTime() + tzOffset * 60000);

      logger.info(
        `Date range for daily stats (in user's local timezone): ${startOfDayUTC.toISOString()} to ${endOfDayUTC.toISOString()}`,
      );

      const dailyPosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfDayUTC),
            lte(posts.createdAt, endOfDayUTC),
          ),
        );

      logger.info(
        `Found ${dailyPosts.length} posts for user ${userId} for today in their local timezone`,
      );

      let dailyPoints = 0;
      for (const post of dailyPosts) {
        if (post.type === "food") dailyPoints += 3;
        else if (post.type === "workout") dailyPoints += 3;
        else if (post.type === "scripture") dailyPoints += 3;
        else if (post.type === "memory_verse") dailyPoints += 10;
      }

      // Weekly stats - Start from Sunday in user's local time
      const dayOfWeek = userLocalTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const startOfWeek = new Date(
        userLocalTime.getFullYear(),
        userLocalTime.getMonth(),
        userLocalTime.getDate() - dayOfWeek, // Go back to the start of the week (Sunday)
        0,
        0,
        0,
        0,
      );
      // Convert back to UTC for database query
      const startOfWeekUTC = new Date(startOfWeek.getTime() + tzOffset * 60000);

      logger.info(
        `Date range for weekly stats (in user's local timezone): ${startOfWeekUTC.toISOString()} to ${endOfDayUTC.toISOString()}`,
      );

      const weeklyPosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfWeekUTC),
            lte(posts.createdAt, endOfDayUTC),
          ),
        );

      let weeklyPoints = 0;
      for (const post of weeklyPosts) {
        if (post.type === "food") weeklyPoints += 3;
        else if (post.type === "workout") weeklyPoints += 3;
        else if (post.type === "scripture") weeklyPoints += 3;
        else if (post.type === "memory_verse") weeklyPoints += 10;
      }

      // Monthly average - Three months ago in user's local time
      const threeMonthsAgo = new Date(
        userLocalTime.getFullYear(),
        userLocalTime.getMonth() - 3,
        userLocalTime.getDate(),
        0,
        0,
        0,
        0,
      );
      // Convert back to UTC for database query
      const threeMonthsAgoUTC = new Date(
        threeMonthsAgo.getTime() + tzOffset * 60000,
      );

      logger.info(
        `Date range for monthly stats (in user's local timezone): ${threeMonthsAgoUTC.toISOString()} to ${endOfDayUTC.toISOString()}`,
      );

      const monthlyPosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, threeMonthsAgoUTC),
            lte(posts.createdAt, endOfDayUTC),
          ),
        );

      let totalPoints = 0;
      for (const post of monthlyPosts) {
        if (post.type === "food") totalPoints += 3;
        else if (post.type === "workout") totalPoints += 3;
        else if (post.type === "scripture") totalPoints += 3;
        else if (post.type === "memory_verse") totalPoints += 10;
      }

      // Calculate monthly average (total points divided by 3 months)
      const monthlyAvgPoints = Math.round(totalPoints / 3);

      logger.info(
        `Stats for user ${userId}: daily=${dailyPoints}, weekly=${weeklyPoints}, monthlyAvg=${monthlyAvgPoints}`,
      );
      res.json({
        dailyPoints,
        weeklyPoints,
        monthlyAvgPoints,
      });
    } catch (error) {
      logger.error(
        `Error calculating user stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      next(error);
    }
  });

  // Add endpoint to delete a notification
  router.delete(
    "/api/notifications/:notificationId",
    authenticate,
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" });

        const notificationId = parseInt(req.params.notificationId);
        if (isNaN(notificationId)) {
          return res.status(400).json({ message: "Invalid notification ID" });
        }

        // Set content type before sending response
        res.setHeader("Content-Type", "application/json");

        // Delete the notification
        const result = await db
          .delete(notifications)
          .where(
            and(
              eq(notifications.userId, req.user.id),
              eq(notifications.id, notificationId),
            ),
          )
          .returning();

        // Log the deletion result
        logger.info(`Deletion result for notification ${notificationId}:`, {
          userId: req.user.id,
        });

        if (!result.length) {
          return res
            .status(404)
            .json({ message: "Notification not found or already deleted" });
        }

        res.json({
          message: "Notification deleted successfully",
          notification: result[0],
        });
      } catch (error) {
        logger.error(
          "Error deleting notification:",
          error instanceof Error ? error : new Error(String(error)),
        );
        res.status(500).json({
          message: "Failed to delete notification",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Get weekly points for a user
  router.get("/api/points/weekly", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userId = req.query.userId
        ? parseInt(req.query.userId as string)
        : req.user.id;
      const now = new Date();

      // Get start of week (Monday)
      const startOfWeek = new Date(now);
      startOfWeek.setDate(
        now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1),
      );
      startOfWeek.setHours(0, 0, 0, 0);

      // Get end of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const result = await db
        .select({
          points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfWeek),
            lte(posts.createdAt, endOfWeek),
            isNull(posts.parentId), // Don't count comments
          ),
        );

      // Ensure this endpoint also has consistent content-type
      res.setHeader("Content-Type", "application/json");
      res.json({
        points: result[0]?.points || 0,
        startDate: startOfWeek.toISOString(),
        endDate: endOfWeek.toISOString(),
      });
    } catch (error) {
      logger.error(
        "Error getting weekly points:",
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        message: "Failed to get weekly points",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get leaderboard data
  router.get("/api/leaderboard", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const now = new Date();

      // Get start of week (Monday)
      const startOfWeek = new Date(now);
      startOfWeek.setDate(
        now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1),
      );
      startOfWeek.setHours(0, 0, 0, 0);

      // Get end of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // First get the user's team ID and group information
      const [currentUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!currentUser || !currentUser.teamId) {
        return res.status(400).json({ message: "User not assigned to a team" });
      }

      // Get the user's team to find their group
      const [currentTeam] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, currentUser.teamId))
        .limit(1);

      if (!currentTeam) {
        return res.status(400).json({ message: "User's team not found" });
      }

      // Get team members points
      const teamMembers = await db
        .select({
          id: users.id,
          username: users.username,
          imageUrl: users.imageUrl,
          points: sql<number>`COALESCE((
            SELECT SUM(p.points)
            FROM posts p
            WHERE p.user_id = users.id
            AND p.created_at >= ${startOfWeek}
            AND p.created_at <= ${endOfWeek}
            AND p.parent_id IS NULL
          ), 0)::integer AS points`,
        })
        .from(users)
        .where(eq(users.teamId, currentUser.teamId))
        .orderBy(sql`points DESC`);

      // Get teams average points - only from the same group as the user's team
      const teamStats = await db.execute(sql`
          SELECT 
            t.id, 
            t.name, 
            COALESCE(AVG(user_points.total_points), 0)::integer as avg_points
          FROM teams t
          LEFT JOIN (
            SELECT 
              u.team_id,
              u.id as user_id,
              COALESCE(SUM(p.points), 0) as total_points
            FROM users u
            LEFT JOIN posts p ON p.user_id = u.id AND p.created_at >= ${startOfWeek} AND p.created_at <= ${endOfWeek} AND p.parent_id IS NULL
            WHERE u.team_id IS NOT NULL
            GROUP BY u.id
          ) user_points ON user_points.team_id = t.id
          WHERE t.group_id = ${currentTeam.groupId}
          GROUP BY t.id, t.name
          ORDER BY avg_points DESC
        `);

      res.setHeader("Content-Type", "application/json");
      res.json({
        teamMembers,
        teamStats,
        weekRange: {
          start: startOfWeek.toISOString(),
          end: endOfWeek.toISOString(),
        },
      });
    } catch (error) {
      logger.error(
        "Error getting leaderboard data:",
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        message: "Failed to get leaderboard data",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Achievement routes
  router.get("/api/achievements", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Get all achievement types
      const allAchievementTypes = await db.select().from(achievementTypes);

      // Get user's earned achievements
      const userAchievementsData = await db
        .select({
          userAchievement: userAchievements,
          achievementType: achievementTypes,
        })
        .from(userAchievements)
        .innerJoin(
          achievementTypes,
          eq(userAchievements.achievementTypeId, achievementTypes.id),
        )
        .where(eq(userAchievements.userId, req.user.id));

      // Format the response
      const earnedAchievements = userAchievementsData.map((item) => ({
        id: item.userAchievement.id,
        type: item.achievementType.type,
        name: item.achievementType.name,
        description: item.achievementType.description,
        iconPath: item.achievementType.iconPath,
        pointValue: item.achievementType.pointValue,
        earnedAt: item.userAchievement.earnedAt,
        viewed: item.userAchievement.viewed,
      }));

      res.json({
        allTypes: allAchievementTypes,
        earned: earnedAchievements,
      });
    } catch (error) {
      logger.error("Error fetching achievements:", error);
      res.status(500).json({
        message: "Failed to fetch achievements",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Mark achievement as viewed
  router.patch(
    "/api/achievements/:id/viewed",
    authenticate,
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" });

        const achievementId = parseInt(req.params.id);
        if (isNaN(achievementId)) {
          return res.status(400).json({ message: "Invalid achievement ID" });
        }

        // Get the achievement to verify ownership
        const [achievement] = await db
          .select()
          .from(userAchievements)
          .where(
            and(
              eq(userAchievements.id, achievementId),
              eq(userAchievements.userId, req.user.id),
            ),
          );

        if (!achievement) {
          return res.status(404).json({ message: "Achievement not found" });
        }

        // Update the achievement viewed status
        const [updated] = await db
          .update(userAchievements)
          .set({ viewed: true })
          .where(eq(userAchievements.id, achievementId))
          .returning();

        res.json(updated);
      } catch (error) {
        logger.error("Error marking achievement as viewed:", error);
        res.status(500).json({
          message: "Failed to update achievement",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Get unviewed achievements only
  router.get("/api/achievements/unviewed", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Get user's unviewed achievements
      const unviewedAchievements = await db
        .select({
          userAchievement: userAchievements,
          achievementType: achievementTypes,
        })
        .from(userAchievements)
        .innerJoin(
          achievementTypes,
          eq(userAchievements.achievementTypeId, achievementTypes.id),
        )
        .where(
          and(
            eq(userAchievements.userId, req.user.id),
            eq(userAchievements.viewed, false),
          ),
        );

      // Format the response
      const formattedAchievements = unviewedAchievements.map((item) => ({
        id: item.userAchievement.id,
        type: item.achievementType.type,
        name: item.achievementType.name,
        description: item.achievementType.description,
        iconPath: item.achievementType.iconPath,
        pointValue: item.achievementType.pointValue,
        earnedAt: item.userAchievement.earnedAt,
      }));

      res.json(formattedAchievements);
    } catch (error) {
      logger.error("Error fetching unviewed achievements:", error);
      res.status(500).json({
        message: "Failed to fetch unviewed achievements",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Initialize achievement types
  const initializeAchievementTypes = async () => {
    try {
      // Check if achievement types exist
      const existingTypes = await db.select().from(achievementTypes);

      if (existingTypes.length === 0) {
        // Insert default achievement types
        const defaultTypes = [
          {
            type: "food-streak-6",
            name: "Food Streak - 6 Days",
            description: "Posted food for 6 consecutive days",
            iconPath: "/achievements/food-streak.svg",
            pointValue: 54,
          },
          {
            type: "workout-streak-5",
            name: "Workout Streak - 5 Days",
            description: "Posted workout for 5 consecutive days",
            iconPath: "/achievements/workout-streak.svg",
            pointValue: 15,
          },
          {
            type: "scripture-streak-7",
            name: "Scripture Streak - 7 Days",
            description: "Posted scripture for 7 consecutive days",
            iconPath: "/achievements/scripture-streak.svg",
            pointValue: 21,
          },
          {
            type: "memory-verse",
            name: "Memory Verse",
            description: "Posted memory verse",
            iconPath: "/achievements/memory-verse.svg",
            pointValue: 10,
          },
        ];

        await db.insert(achievementTypes).values(defaultTypes);
        logger.info("Initialized default achievement types");
      }
    } catch (error) {
      logger.error("Error initializing achievement types:", error);
    }
  };

  // Call initialization when server starts
  initializeAchievementTypes();

  // Function to check for achievements based on post type
  const checkForAchievements = async (userId: number, postType: string) => {
    try {
      // Get user's recent posts of this type to check for streaks
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // Look back 10 days to find streaks

      const userPosts = await db
        .select({
          type: posts.type,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            eq(posts.type, postType),
            gte(posts.createdAt, recentDate),
            isNull(posts.parentId), // Don't count comments
          ),
        )
        .orderBy(desc(posts.createdAt));

      // Get all achievement types
      const allAchievements = await db.select().from(achievementTypes);

      // Get user's already earned achievements
      const earnedAchievements = await db
        .select({
          userAchievement: userAchievements,
          achievementType: achievementTypes,
        })
        .from(userAchievements)
        .innerJoin(
          achievementTypes,
          eq(userAchievements.achievementTypeId, achievementTypes.id),
        )
        .where(eq(userAchievements.userId, userId));

      const earnedTypes = new Set(
        earnedAchievements.map((a) => a.achievementType.type),
      );

      // Check for streaks based on post type
      if (postType === "food") {
        await checkFoodStreak(userId, userPosts, allAchievements, earnedTypes);
      } else if (postType === "workout") {
        await checkWorkoutStreak(
          userId,
          userPosts,
          allAchievements,
          earnedTypes,
        );
      } else if (postType === "scripture") {
        await checkScriptureStreak(
          userId,
          userPosts,
          allAchievements,
          earnedTypes,
        );
      } else if (postType === "memory_verse") {
        await checkMemoryVerseStreak(
          userId,
          userPosts,
          allAchievements,
          earnedTypes,
        );
      }
    } catch (error) {
      logger.error("Error checking for achievements:", error);
      throw error;
    }
  };

  // Helper function to check food streaks
  const checkFoodStreak = async (
    userId: number,
    userPosts: any[],
    allAchievements: any[],
    earnedTypes: Set<string>,
  ) => {
    try {
      if (userPosts.length < 3) return; // Need at least 3 posts for a streak

      // Group posts by day to count as 1 per day
      const postsByDay = new Map<string, boolean>();
      userPosts.forEach((post) => {
        const date = new Date(post.createdAt);
        const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        postsByDay.set(dateKey, true);
      });

      // Check for consecutive days
      const sortedDays = Array.from(postsByDay.keys()).sort();
      let currentStreak = 1;
      let maxStreak = 1;

      for (let i = 1; i < sortedDays.length; i++) {
        const prevDay = new Date(sortedDays[i - 1]);
        const currDay = new Date(sortedDays[i]);

        const diffTime = Math.abs(currDay.getTime() - prevDay.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }

      // Award achievements based on streak length
      if (maxStreak >= 6 && !earnedTypes.has("food-streak-6")) {
        await awardAchievement(userId, "food-streak-6", allAchievements);
      }
    } catch (error) {
      logger.error("Error checking food streak:", error);
    }
  };

  // Helper function to check workout streaks
  const checkWorkoutStreak = async (
    userId: number,
    userPosts: any[],
    allAchievements: any[],
    earnedTypes: Set<string>,
  ) => {
    try {
      if (userPosts.length < 3) return; // Need at least 3 posts for a streak

      // Group posts by day to count as 1 per day
      const postsByDay = new Map<string, boolean>();
      userPosts.forEach((post) => {
        const date = new Date(post.createdAt);
        const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        postsByDay.set(dateKey, true);
      });

      // Check for consecutive days
      const sortedDays = Array.from(postsByDay.keys()).sort();
      let currentStreak = 1;
      let maxStreak = 1;

      for (let i = 1; i < sortedDays.length; i++) {
        const prevDay = new Date(sortedDays[i - 1]);
        const currDay = new Date(sortedDays[i]);

        const diffTime = Math.abs(currDay.getTime() - prevDay.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }

      // Award achievements based on streak length
      if (maxStreak >= 5 && !earnedTypes.has("workout-streak-5")) {
        await awardAchievement(userId, "workout-streak-5", allAchievements);
      }
    } catch (error) {
      logger.error("Error checking workout streak:", error);
    }
  };

  // Helper function to check scripture streaks
  const checkScriptureStreak = async (
    userId: number,
    userPosts: any[],
    allAchievements: any[],
    earnedTypes: Set<string>,
  ) => {
    try {
      if (userPosts.length < 3) return; // Need at least 3 posts for a streak

      // Group posts by day to count as 1 per day
      const postsByDay = new Map<string, boolean>();
      userPosts.forEach((post) => {
        const date = new Date(post.createdAt);
        const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        postsByDay.set(dateKey, true);
      });

      // Check for consecutive days
      const sortedDays = Array.from(postsByDay.keys()).sort();
      let currentStreak = 1;
      let maxStreak = 1;

      for (let i = 1; i < sortedDays.length; i++) {
        const prevDay = new Date(sortedDays[i - 1]);
        const currDay = new Date(sortedDays[i]);

        const diffTime = Math.abs(currDay.getTime() - prevDay.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }

      // Award achievements based on streak length
      if (maxStreak >= 7 && !earnedTypes.has("scripture-streak-7")) {
        await awardAchievement(userId, "scripture-streak-7", allAchievements);
      }
    } catch (error) {
      logger.error("Error checking scripture streak:", error);
    }
  };

  // Helper function to check memory verse streaks
  const checkMemoryVerseStreak = async (
    userId: number,
    userPosts: any[],
    allAchievements: any[],
    earnedTypes: Set<string>,
  ) => {
    try {
      if (userPosts.length < 4) return; // Need at least 4 posts for a 4-week streak

      // Group posts by week to count as 1 per week
      const postsByWeek = new Map<string, boolean>();
      userPosts.forEach((post) => {
        const date = new Date(post.createdAt);
        // Get the week number (approximate)
        const weekNum = Math.floor(date.getDate() / 7);
        const weekKey = `${date.getFullYear()}-${date.getMonth() + 1}-week-${weekNum}`;
        postsByWeek.set(weekKey, true);
      });

      // Check for consecutive weeks
      const sortedWeeks = Array.from(postsByWeek.keys()).sort();

      // If we have at least 4 weeks of memory verses
      if (
        sortedWeeks.length >= 1 &&
        !earnedTypes.has("memory-verse")
      ) {
        await awardAchievement(
          userId,
          "memory-verse",
          allAchievements,
        );
      }
    } catch (error) {
      logger.error("Error checking memory verse streak:", error);
    }
  };

  // Helper function to award an achievement
  const awardAchievement = async (
    userId: number,
    achievementType: string,
    allAchievements: any[],
  ) => {
    try {
      // Find the matching achievement type
      const achievementTypeObj = allAchievements.find(
        (a) => a.type === achievementType,
      );
      if (!achievementTypeObj) {
        logger.error(`Achievement type not found: ${achievementType}`);
        return;
      }

      // Check if user already has this achievement
      const existingAchievement = await db
        .select()
        .from(userAchievements)
        .innerJoin(
          achievementTypes,
          eq(userAchievements.achievementTypeId, achievementTypes.id),
        )
        .where(
          and(
            eq(userAchievements.userId, userId),
            eq(achievementTypes.type, achievementType),
          ),
        );

      if (existingAchievement.length > 0) {
        logger.info(
          `User ${userId} already has achievement ${achievementType}`,
        );
        return;
      }

      // Award the achievement
      const [newAchievement] = await db
        .insert(userAchievements)
        .values({
          userId: userId,
          achievementTypeId: achievementTypeObj.id,
          earnedAt: new Date(),
          viewed: false,
        })
        .returning();

      logger.info(`Awarded achievement ${achievementType} to user ${userId}`);

      // Add points to user
      await db
        .update(users)        .set({
          points: sql`${users.points} + ${achievementTypeObj.pointValue}`,
        })
        .where(eq(users.id, userId));

      // Notify the user about the achievement
      const userSockets = clients.get(userId);
      if (
        userSockets &&
        userSockets.size > 0 &&
        userSockets.values().next().value.readyState === WebSocket.OPEN
      ) {
        // Send the achievement notification
        const achievementData = {
          type: "achievement",
          achievement: {
            id: newAchievement.id,
            type: achievementType,
            name: achievementTypeObj.name,
            description: achievementTypeObj.description,
            iconPath: achievementTypeObj.iconPath,
            pointValue: achievementTypeObj.pointValue,
          },
        };

        for (const client of userSockets) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(achievementData));
          }
        }
      }
    } catch (error) {
      logger.error(
        `Error awarding achievement ${achievementType} to user ${userId}:`,
        error,
      );
    }
  };

  // Object Storage routes removed - not needed

  // Main file serving route that thumbnails expect
  app.get("/api/serve-file", async (req: Request, res: Response) => {
    try {
      const filename = req.query.filename as string;

      if (!filename) {
        return res
          .status(400)
          .json({ error: "Filename parameter is required" });
      }

      logger.info(`Serving file: ${filename}`, { route: "/api/serve-file" });

      // Import the Object Storage utility that was working before
      const { spartaObjectStorage } = await import(
        "./sparta-object-storage-final"
      );

      // Check if this is a thumbnail request
      const isThumbnail = req.query.thumbnail === "true";

      // Construct the proper Object Storage key
      let storageKey: string;
      if (isThumbnail) {
        storageKey = filename.includes("thumbnail")
          ? `shared/uploads/${filename}`
          : `shared/uploads/thumbnails/${filename}`;
      } else {
        // For regular files, construct the key as it was stored
        storageKey = filename.startsWith("shared/")
          ? filename
          : `shared/uploads/${filename}`;
      }

      // Download the file from Object Storage
      const result = await spartaObjectStorage.downloadFile(storageKey);

      // Handle the Object Storage response format
      let fileBuffer: Buffer;

      if (Buffer.isBuffer(result)) {
        fileBuffer = result;
      } else if (result && typeof result === "object" && "value" in result) {
        if (Buffer.isBuffer(result.value)) {
          fileBuffer = result.value;
        } else if (Array.isArray(result.value)) {
          fileBuffer = Buffer.from(result.value);
        } else {
          fileBuffer = Buffer.from(result.value, "base64");
        }
      } else {
        logger.error(
          `Unexpected Object Storage response format for ${storageKey}:`,
          typeof result,
        );
        return res
          .status(404)
          .json({
            error: "File not found",
            message: `Could not retrieve ${storageKey}`,
          });
      }

      // Set appropriate content type
      const ext = filename.toLowerCase().split(".").pop();
      let contentType = "application/octet-stream";

      switch (ext) {
        case "jpg":
        case "jpeg":
          contentType = "image/jpeg";
          break;
        case "png":
          contentType = "image/png";
          break;
        case "gif":
          contentType = "image/gif";
          break;
        case "webp":
          contentType = "image/webp";
          break;
        case "svg":
          contentType = "image/svg+xml";
          break;
        case "mp4":
          contentType = "video/mp4";
          break;
        case "mov":
          contentType = "video/quicktime";
          break;
        case "webm":
          contentType = "video/webm";
          break;
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.setHeader(
        "Access-Control-Allow-Origin",
        "https://a0341f86-dcd3-4fbd-8a10-9a1965e07b56-00-2cetph4iixb13.worf.replit.dev",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept",
      );
      res.setHeader("Content-Length", fileBuffer.length);

      logger.info(
        `Successfully served file: ${storageKey}, size: ${fileBuffer.length} bytes`,
      );
      return res.send(fileBuffer);
    } catch (error) {
      logger.error(`Error serving file: ${error}`, {
        route: "/api/serve-file",
      });
      return res.status(404).json({
        error: "File not found",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Helper function to validate and fix HTML tags
  const validateAndFixHTML = (html: string): { content: string; errors: string[] } => {
    const errors: string[] = [];
    let fixedContent = html;

    // Simple fix for malformed YouTube video embeds: 
    // Replace closing </div> with </div></a> for video-wrapper divs
    // This handles the case where mammoth creates: <a href="<div class="video-wrapper">...</div>
    // Pattern matches the complete video-wrapper div and adds </a> after the closing </div>
    fixedContent = fixedContent.replace(/(<div\s+class=["']video-wrapper["'][^>]*>[\s\S]*?)<\/div>/g, '$1</div></a>');
    
    // Basic tag validation for debugging
    const openDivCount = (fixedContent.match(/<div/g) || []).length;
    const closeDivCount = (fixedContent.match(/<\/div>/g) || []).length;
    const openACount = (fixedContent.match(/<a\s/g) || []).length;
    const closeACount = (fixedContent.match(/<\/a>/g) || []).length;
    
    if (openDivCount !== closeDivCount) {
      errors.push(`Mismatched div tags: ${openDivCount} opening, ${closeDivCount} closing`);
    }
    
    if (openACount !== closeACount) {
      errors.push(`Mismatched anchor tags: ${openACount} opening, ${closeACount} closing`);
    }
    
    return { content: fixedContent, errors };
  };

  // Add document upload endpoint for activities
  router.post(
    "/api/activities/upload-doc",
    authenticate,
    multer({ storage: multer.memoryStorage() }).single("document"),
    async (req, res) => {
      try {
        // Set content type early to ensure JSON response
        res.setHeader("Content-Type", "application/json");

        logger.info('Document upload endpoint called', {
          hasUser: !!req.user,
          isAdmin: req.user?.isAdmin,
          hasFile: !!req.file,
          filename: req.file?.originalname
        });

        if (!req.user?.isAdmin) {
          logger.warn('Upload denied - not admin');
          return res.status(403).json({ message: "Not authorized" });
        }

        if (!req.file) {
          logger.error('No file in upload request');
          return res.status(400).json({ message: "No file uploaded" });
        }

        // Validate file type
        if (!req.file.originalname.toLowerCase().endsWith('.docx')) {
          logger.warn('Upload denied - invalid file type', { filename: req.file.originalname });
          return res.status(400).json({ message: "Only .docx files are supported" });
        }

        // Use mammoth to convert Word document to HTML to preserve formatting
        logger.info(`Processing document: ${req.file.originalname}, size: ${req.file.buffer.length} bytes`);

        const result = await mammoth.convertToHtml({ buffer: req.file.buffer });

        logger.info(`Document converted successfully, content length: ${result.value.length}`);

        // Validate and fix HTML tags before returning
        const { content: validatedContent, errors } = validateAndFixHTML(result.value);
        
        if (errors.length > 0) {
          logger.warn(`HTML validation found ${errors.length} issues in ${req.file.originalname}:`, errors);
        } else {
          logger.info(`HTML validation passed for ${req.file.originalname}`);
        }

        // Return validated content
        res.json({ 
          content: validatedContent,
          validationErrors: errors.length > 0 ? errors : undefined
        });
      } catch (error) {
        logger.error("Error processing document:", {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          filename: req.file?.originalname
        });

        res.status(500).json({ 
          message: "Failed to process document",
          error: error instanceof Error ? error.message : "Unknown error",
          details: error instanceof Error ? error.stack : undefined
        });
      }
    }
  );

  return httpServer;
};