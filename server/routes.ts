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
  asc,
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
import fs from "fs";
import path from "path";
// Object Storage routes removed - not needed
import { messageRouter } from "./message-routes";
import { userRoleRouter } from "./user-role-route";
import { groupAdminRouter } from "./group-admin-routes";
import { inviteCodeRouter } from "./invite-code-routes";
import { spartaStorage } from "./sparta-object-storage";

// Configure multer for memory storage (Object Storage only)
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
  console.log("=== REGISTER ROUTES CALLED ===");
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

  // Check if user has any posts (used for intro video requirement)
  router.get("/api/posts/has-any-posts", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userPosts = await db
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(
            eq(posts.userId, req.user.id),
            isNull(posts.parentId) // Don't count comment posts
          )
        )
        .limit(1);

      res.json({ hasAnyPosts: userPosts.length > 0 });
    } catch (error) {
      logger.error("Error checking user posts:", error);
      res.status(500).json({
        message: "Failed to check user posts",
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

              // Only send if within time window, no notifications sent today, AND user is in a team
              const existingNotifications = await db
                .select()
                .from(notifications)
                .where(
                  and(
                    eq(notifications.userId, user.id),
                    eq(notifications.type, "reminder"), // Check for reminder type
                    gte(notifications.createdAt, new Date(new Date().setHours(0, 0, 0, 0))), // Check if sent today
                  ),
                );

              if (isPreferredTimeWindow && existingNotifications.length === 0 && user.teamId) {
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
                if (!isPreferredTimeWindow) {
                  logger.info(
                    `User ${user.id}'s preferred time ${preferredHour}:${preferredMinute} doesn't match test time ${hour}:${minute}`,
                  );
                } else if (existingNotifications.length > 0) {
                  logger.info(
                    `User ${user.id} already received a reminder today.`
                  );
                } else if (!user.teamId) {
                  logger.info(`User ${user.id} is not in a team, skipping reminder.`);
                }
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

  // Edit a comment
  router.patch("/api/posts/comments/:commentId", authenticate, async (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const commentId = parseInt(req.params.commentId);
      if (isNaN(commentId)) {
        return res.status(400).json({ message: "Invalid comment ID" });
      }

      const { content } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ message: "Content cannot be empty" });
      }

      // Get the comment to check ownership
      const [comment] = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.id, commentId),
            eq(posts.type, 'comment')
          )
        );

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      if (comment.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to edit this comment" });
      }

      // Update the comment
      const [updatedComment] = await db
        .update(posts)
        .set({ content: content.trim() })
        .where(eq(posts.id, commentId))
        .returning();

      res.json(updatedComment);
    } catch (error) {
      logger.error("Error editing comment:", error);
      res.status(500).json({
        message: "Failed to edit comment",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Delete a comment
  router.delete("/api/posts/comments/:commentId", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.setHeader('Content-Type', 'application/json');

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const commentId = parseInt(req.params.commentId);
      if (isNaN(commentId)) {
        return res.status(400).json({ message: "Invalid comment ID" });
      }

      // Get the comment first to check ownership
      const [comment] = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.id, commentId),
            eq(posts.type, 'comment')
          )
        );

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Check if user is authorized to delete this comment
      if (comment.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this comment" });
      }

      // Delete the comment
      await db
        .delete(posts)
        .where(eq(posts.id, commentId));

      res.json({ message: "Comment deleted successfully" });
    } catch (error) {
      logger.error("Error deleting comment:", error);
      res.status(500).json({
        message: "Failed to delete comment",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

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

  // Prayer requests unread count endpoint
  router.get("/api/prayer-requests/unread", authenticate, async (req, res) => {
    try {
      res.setHeader("Content-Type", "application/json");
      
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // For now, return 0 - prayer request tracking can be enhanced later
      logger.info(`Found 0 unread messages for user ${req.user.id}`);
      res.json({ unreadCount: 0 });
    } catch (error) {
      logger.error("Error fetching prayer requests unread count:", error);
      res.status(500).json({
        message: "Failed to fetch unread prayer requests count",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

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
      // This includes posts from team members AND posts targeted to this team via scope
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

        // Filter posts to show:
        // 1. Posts from team members (my_team scope), OR
        // 2. Posts targeted to this team (team scope with target_team_id matching)
        conditions.push(
          or(
            inArray(posts.userId, memberIds),
            and(
              eq(posts.postScope, 'team'),
              eq(posts.targetTeamId, req.user.teamId)
            )
          )
        );
        logger.info(`Filtering posts for team ${req.user.teamId} with ${memberIds.length} members PLUS team-targeted posts`);
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

      // Add scope-based filtering
      // Users should only see posts where:
      // 1. post_scope is 'everyone', OR
      // 2. post_scope is 'my_team' and they're in the author's team, OR
      // 3. post_scope is 'team' and they're in the target team, OR
      // 4. post_scope is 'group' and they're in a team within the target group, OR
      // 5. post_scope is 'organization' and they're in a group within the target organization
      
      if (req.user.teamId) {
        // Get user's team info to check group and organization
        const [userTeam] = await db
          .select({
            groupId: teams.groupId
          })
          .from(teams)
          .where(eq(teams.id, req.user.teamId));
        
        const userGroupId = userTeam?.groupId;
        
        let userOrganizationId = null;
        if (userGroupId) {
          const [userGroup] = await db
            .select({
              organizationId: groups.organizationId
            })
            .from(groups)
            .where(eq(groups.id, userGroupId));
          
          userOrganizationId = userGroup?.organizationId;
        }

        // Get all user IDs in the same team (for my_team scope filtering)
        const teamMemberIds = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.teamId, req.user.teamId));
        
        const memberIds = teamMemberIds.map(member => member.id);

        // Build scope filter conditions
        const scopeConditions = [
          // Everyone posts - visible to all
          eq(posts.postScope, 'everyone'),
          // My team posts - user must be in the same team as the author
          and(
            eq(posts.postScope, 'my_team'),
            inArray(posts.userId, memberIds)
          ),
          // Team posts - user must be in the target team
          and(
            eq(posts.postScope, 'team'),
            eq(posts.targetTeamId, req.user.teamId)
          ),
        ];

        // Group posts - user's team must be in the target group
        if (userGroupId) {
          scopeConditions.push(
            and(
              eq(posts.postScope, 'group'),
              eq(posts.targetGroupId, userGroupId)
            )
          );
        }

        // Organization posts - user's group must be in the target organization
        if (userOrganizationId) {
          scopeConditions.push(
            and(
              eq(posts.postScope, 'organization'),
              eq(posts.targetOrganizationId, userOrganizationId)
            )
          );
        }

        // Add the scope filter to conditions
        if (scopeConditions.length > 0) {
          conditions.push(or(...scopeConditions));
        }
        
        logger.info(`[SCOPE FILTER] User ${req.user.id} (team ${req.user.teamId}) - Scope conditions count: ${scopeConditions.length}`);
      } else {
        // User has no team - only show 'everyone' posts
        conditions.push(eq(posts.postScope, 'everyone'));
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
          postScope: posts.postScope,
          targetOrganizationId: posts.targetOrganizationId,
          targetGroupId: posts.targetGroupId,
          targetTeamId: posts.targetTeamId,
          author: {
            id: users.id,
            username: users.username,
            email: users.email,
            imageUrl: users.imageUrl,
            isAdmin: users.isAdmin,
            teamId: users.teamId,
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

  // POST endpoint for creating posts
  router.post("/api/posts", authenticate, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'thumbnail_alt', maxCount: 1 },
    { name: 'thumbnail_jpg', maxCount: 1 }
  ]), async (req, res) => {
    // Set content type early to prevent browser confusion
    res.set({
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff'
    });

    // Initialize isVideo variable to be used throughout the route handler
    let isVideo = false;

    // Extract the main file from upload.fields() - it could be in 'image' or 'thumbnail' field
    const uploadedFile = (req.files as any)?.image?.[0] || (req.files as any)?.thumbnail?.[0] || null;

    console.log("POST /api/posts - Request received", {
      hasFile: !!uploadedFile,
      fileDetails: uploadedFile ? {
        fieldname: uploadedFile.fieldname,
        originalname: uploadedFile.originalname,
        mimetype: uploadedFile.mimetype,
        path: uploadedFile.path,
        destination: uploadedFile.destination,
        size: uploadedFile.size
      } : 'No file uploaded',
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body),
      filesKeys: req.files ? Object.keys(req.files) : []
    });

    // Check if this is a memory verse post based on the parsed data
    let isMemoryVersePost = false;
    if (req.body.data) {
      try {
        const parsedData = JSON.parse(req.body.data);
        isMemoryVersePost = parsedData.type === 'memory_verse';
        if (isMemoryVersePost) {
          console.log("Memory verse post detected:", {
            originalname: uploadedFile?.originalname || 'No file',
            mimetype: uploadedFile?.mimetype || 'No mimetype',
            fileSize: uploadedFile?.size || 0,
            path: uploadedFile?.path || 'No path'
          });
        }
      } catch (e) {
        // Ignore parsing errors here, it will be handled later
      }
    }

    // Memory storage: files are in buffer, not on disk
    if (uploadedFile && uploadedFile.buffer) {
      console.log("File buffer received:", {
        size: uploadedFile.buffer.length,
        mimetype: uploadedFile.mimetype,
        originalname: uploadedFile.originalname
      });
    }

    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      let postData = req.body;
      if (typeof postData.data === 'string') {
        try {
          postData = JSON.parse(postData.data);
          console.log("Successfully parsed post data:", { postType: postData.type });
        } catch (parseError) {
          console.error("Error parsing post data:", parseError);
          logger.error("Error parsing post data:", parseError);
          return res.status(400).json({ message: "Invalid post data format" });
        }
      }

      // Calculate points based on post type
      let points = 0;
      const type = postData.type?.toLowerCase();
      switch (type) {
        case 'food':
          points = 3; // 3 points per meal
          break;
        case 'workout':
          points = 3; // 3 points per workout
          break;
        case 'scripture':
          points = 3; // 3 points per scripture
          break;
        case 'memory_verse':
          points = 10; // 10 points for memory verse
          break;
        case 'prayer':
          points = 0; // 0 points for prayer requests
          break;
        case 'miscellaneous':
        default:
          points = 0;
      }

      // Log point assignment for verification
      console.log('Assigning points:', { type, points });

      // Log point calculation for verification
      logger.info('Post points calculation:', {
        type: postData.type,
        assignedPoints: points
      });

      // For comments, handle separately
      if (postData.type === "comment") {
        if (!postData.parentId) {
          logger.error("Missing parentId for comment");
          return res.status(400).json({ message: "Parent post ID is required for comments" });
        }

        // Comments should have 0 points
        const commentPoints = 0;

        // Log the points assignment for comments
        console.log('Assigning points for comment:', { type: 'comment', points: commentPoints });

        // Process media file if present for comments too
        let commentMediaUrl = null;

        // Check if we have a file upload with the comment
        if (uploadedFile && uploadedFile.buffer) {
          try {
            // Use SpartaObjectStorage for file handling
            const { spartaStorage } = await import('./sparta-object-storage');

            // With memory storage, work directly with the buffer
            logger.info(`Processing comment file from memory buffer: ${uploadedFile.originalname}, size: ${uploadedFile.buffer.length} bytes`);

            const originalFilename = uploadedFile.originalname.toLowerCase();

            // Check if this is a video upload based on multiple indicators
            const isVideoMimetype = uploadedFile.mimetype.startsWith('video/');
            const isVideoExtension = originalFilename.endsWith('.mov') || 
                                   originalFilename.endsWith('.mp4') ||
                                   originalFilename.endsWith('.webm') ||
                                   originalFilename.endsWith('.avi') ||
                                   originalFilename.endsWith('.mkv');
            const hasVideoContentType = req.body.video_content_type?.startsWith('video/');


            // Combined video detection - for miscellaneous posts, only trust the explicit markers
            const isVideo = isVideoMimetype || hasVideoContentType || isVideoExtension;


            console.log("Processing comment media file:", {
              originalFilename: uploadedFile.originalname,
              mimetype: uploadedFile.mimetype,
              isVideo: isVideo,
              fileSize: uploadedFile.size
            });

            logger.info(`Processing comment media file: ${uploadedFile.originalname}, type: ${uploadedFile.mimetype}, isVideo: ${isVideo}, size: ${uploadedFile.size}`);

            const fileInfo = await spartaStorage.storeFile(
              uploadedFile.buffer,
              uploadedFile.originalname,
              uploadedFile.mimetype,
              isVideo
            );

            commentMediaUrl = fileInfo.url;
            console.log(`Stored comment media file:`, { url: commentMediaUrl });
          } catch (error) {
            logger.error("Error processing comment media file:", error);
            // Continue with comment creation even if media processing fails
          }
        }

        const post = await storage.createComment({
          userId: req.user.id,
          content: postData.content.trim(),
          parentId: postData.parentId,
          depth: postData.depth || 0,
          points: commentPoints, // Always set to 0 points for comments
          mediaUrl: commentMediaUrl // Add the media URL if a file was uploaded
        });
        return res.status(201).json(post);
      }

      // Handle regular post creation
      let mediaUrl = null;
      let mediaProcessed = false;

      // Check if we're using an existing memory verse video
      if (postData.type === 'memory_verse' && req.body.existing_video_id) {
        try {
          const existingVideoId = parseInt(req.body.existing_video_id);

          // Get the existing post to find its media URL
          const [existingPost] = await db
            .select({
              mediaUrl: posts.mediaUrl
            })
            .from(posts)
            .where(
              and(
                eq(posts.id, existingVideoId),
                eq(posts.userId, req.user.id),
                eq(posts.type, 'memory_verse')
              )
            );

          if (existingPost && existingPost.mediaUrl) {
            mediaUrl = existingPost.mediaUrl;
            logger.info(`Re-using existing memory verse video from post ${existingVideoId}`, { mediaUrl });
          } else {
            logger.error(`Could not find existing memory verse video with ID ${existingVideoId}`);
            return res.status(404).json({ message: "The selected memory verse video could not be found" });
          }
        } catch (error) {
          logger.error("Error processing existing video reference:", error);
          return res.status(500).json({ message: "Error processing the selected memory verse video" });
        }
      }
      // Scripture posts shouldn't have images/videos
      // Miscellaneous posts may or may not have images/videos
      else if (postData.type === 'scripture') {
        logger.info('Scripture post created with no media');
        mediaUrl = null;
      } else if (uploadedFile && uploadedFile.buffer) {
        try {
          // Use SpartaObjectStorage for file handling
          const { spartaStorage } = await import('./sparta-object-storage');

          // With memory storage, we work directly with the buffer
          logger.info(`Processing file from memory buffer: ${uploadedFile.originalname}, size: ${uploadedFile.buffer.length} bytes`);

          // Proceed with buffer-based processing
            // Handle video files differently - check both mimetype and file extension
            const originalFilename = uploadedFile.originalname.toLowerCase();

            // Simplified detection for memory verse posts - rely only on the post type
            const isMemoryVersePost = postData.type === 'memory_verse';

            // Handle specialized types
            const isMiscellaneousPost = postData.type === 'miscellaneous';

            console.log("Post type detection:", {
              isMemoryVersePost,
              isMiscellaneousPost,
              originalName: uploadedFile.originalname
            });

            // Check if this is a video upload based on multiple indicators
            const isVideoMimetype = uploadedFile.mimetype.startsWith('video/');
            const isVideoExtension = originalFilename.endsWith('.mov') || 
                                   originalFilename.endsWith('.mp4') ||
                                   originalFilename.endsWith('.webm') ||
                                   originalFilename.endsWith('.avi') ||
                                   originalFilename.endsWith('.mkv');
            const hasVideoContentType = req.body.video_content_type?.startsWith('video/');

            // For miscellaneous posts, check if explicitly marked as video from client
            const isMiscellaneousVideo = isMiscellaneousPost && 
                                       (req.body.is_video === "true" || 
                                        req.body.selected_media_type === "video" ||
                                        (uploadedFile && (isVideoMimetype || isVideoExtension)));

            // Combined video detection - for miscellaneous posts, only trust the explicit markers
            const isVideo = isMemoryVersePost || 
                          (isMiscellaneousPost ? isMiscellaneousVideo : 
                           (isVideoMimetype || hasVideoContentType || isVideoExtension));

            console.log("Video detection:", {
              isVideo,
              isMiscellaneousVideo,
              isMiscellaneousPost,
              postType: postData.type,
              isVideoMimetype,
              isVideoExtension,
              hasVideoContentType,
              mimetype: uploadedFile.mimetype,
              originalFilename: uploadedFile.originalname,
              selectedMediaType: req.body.selected_media_type,
              isVideoFlag: req.body.is_video
            });

            // We no longer need to create a separate file with prefix here.
            // SpartaObjectStorage will handle proper file placement based on post type.
            // This removes the creation of a redundant third file.
            console.log("Skipping redundant file creation - SpartaObjectStorage will handle file organization");

            console.log(`Processing media file:`, {
              originalFilename: uploadedFile.originalname,
              mimetype: uploadedFile.mimetype,
              isVideo: isVideo,
              isMemoryVerse: isMemoryVersePost,
              fileSize: uploadedFile.size,
              path: uploadedFile.path,
              postType: postData.type || 'unknown'
            });

            logger.info(`Processing media file: ${uploadedFile.originalname}, type: ${uploadedFile.mimetype}, isVideo: ${isVideo}, size: ${uploadedFile.size}`);

            // Store the file using SpartaObjectStorage (used for both images and videos)
            // For memory verse posts, if mimetype doesn't specify video, force it to video/mp4
            let effectiveMimeType = uploadedFile.mimetype;

            // If it's a memory verse post but mimetype doesn't indicate a video, override it
            if (isMemoryVersePost && !effectiveMimeType.startsWith('video/')) {
              effectiveMimeType = 'video/mp4'; // Default to mp4 for compatibility
            }

            // Also handle miscellaneous post videos that might have wrong mime type
            if (isMiscellaneousPost && isVideo && !effectiveMimeType.startsWith('video/')) {
              console.log("Correcting miscellaneous video mime type from", effectiveMimeType, "to video/mp4");
              effectiveMimeType = 'video/mp4';
            }

            console.log("Using effective mime type for storage:", {
              original: uploadedFile.mimetype,
              effective: effectiveMimeType,
              isMemoryVerse: isMemoryVersePost,
              isMiscellaneous: isMiscellaneousPost,
              isVideo: isVideo,
              wasOverridden: effectiveMimeType !== uploadedFile.mimetype,
              fileSize: uploadedFile.size,
              formDataKeys: Object.keys(req.body || {})
            });

            const fileInfo = await spartaStorage.storeFile(
              uploadedFile.buffer,
              uploadedFile.originalname,
              effectiveMimeType, // Use potentially corrected mimetype
              isVideo // Pass flag for video handling
            );

            mediaUrl = fileInfo.url;
            mediaProcessed = true;

            if (isVideo) {
              logger.info(`Video file stored successfully using SpartaObjectStorage`);
              logger.info(`Video URL: ${mediaUrl}`);
            } else {
              logger.info(`Image file stored successfully using SpartaObjectStorage`);
              logger.info(`Image URL: ${mediaUrl}`);
              if (fileInfo.thumbnailUrl) {
                logger.info(`Thumbnail URL: ${fileInfo.thumbnailUrl}`);
              }
            }
        } catch (fileErr) {
          logger.error('Error processing uploaded file:', fileErr);

          // Detailed error handling based on post type
          if (postData.type === 'memory_verse') {
            logger.error(`Memory verse video upload failed: ${fileErr instanceof Error ? fileErr.message : 'Unknown error'}`);

            // For memory verse, video is required, so return an error response
            return res.status(400).json({ 
              message: "Failed to process memory verse video. Please try again with a different video file.",
              details: fileErr instanceof Error ? fileErr.message : 'Unknown error processing video'
            });
          } else if (postData.type === 'food' || postData.type === 'workout') {
            logger.error(`${postData.type} image upload failed: ${fileErr instanceof Error ? fileErr.message : 'Unknown error'}`);

            // For food and workout posts, images are required
            return res.status(400).json({ 
              message: `Failed to process ${postData.type} image. Please try again with a different image.`,
              details: fileErr instanceof Error ? fileErr.message : 'Unknown error processing image'
            });
          } else {
            // For other post types, we can continue without media
            mediaUrl = null;
            logger.info(`Error with uploaded file for post type: ${postData.type} - continuing without media`);
          }
        }
      } else if (postData.type && postData.type !== 'scripture' && postData.type !== 'miscellaneous') {
        // For miscellaneous posts, media is optional
        // For scripture posts, no media
        // Memory verse posts REQUIRE a video
        if (postData.type === 'memory_verse') {
          logger.error(`Memory verse post requires a video but none was uploaded`);
          return res.status(400).json({ message: "Memory verse posts require a video file." });
        }
        // For other posts, we previously would use fallbacks, but now we leave them blank
        mediaUrl = null;
        logger.info(`No media uploaded for ${postData.type} post`);
      }

      const post = await db
        .insert(posts)
        .values({
          userId: req.user.id,
          type: postData.type,
          content: postData.content?.trim() || '',
          mediaUrl: mediaUrl,
          is_video: isVideo || false, // Set is_video flag based on our detection logic
          points: points,
          postScope: postData.postScope || 'my_team',
          targetOrganizationId: postData.targetOrganizationId || null,
          targetGroupId: postData.targetGroupId || null,
          targetTeamId: postData.targetTeamId || null,
          createdAt: postData.createdAt ? new Date(postData.createdAt) : new Date()
        })
        .returning()
        .then(posts => posts[0]);

      // Log the created post for verification
      logger.info('Created post with points:', { postId: post.id, type: post.type, points: post.points });

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
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      });

      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to create post",
        error: error instanceof Error ? error.stack : "Unknown error"
      });
    }
  });

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

  // Delete a post
  router.delete("/api/posts/:id", authenticate, async (req, res) => {
    try {
      res.set({
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
      });

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      // Check if user owns the post or is admin
      const [post] = await db
        .select({
          id: posts.id,
          userId: posts.userId,
        })
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (post.userId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }

      await storage.deletePost(postId);

      return res.json({ message: "Post deleted successfully" });
    } catch (error) {
      logger.error("Error deleting post:", error);
      res.set("Content-Type", "application/json");
      return res.status(500).json({
        message: "Failed to delete post",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

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

  // Check if a team is in a competitive group
  router.get("/api/teams/:teamId/competitive", authenticate, async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      if (isNaN(teamId)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }

      // Get the team's group
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Get the group to check if it's competitive
      const [group] = await db
        .select()
        .from(groups)
        .where(eq(groups.id, team.groupId))
        .limit(1);

      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }

      res.json({ competitive: group.competitive || false });
    } catch (error) {
      logger.error("Error checking team competitive status:", error);
      res.status(500).json({ message: "Failed to check competitive status" });
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

  // Get team deletion info (counts of what will be deleted)
  router.get("/api/teams/:id/delete-info", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const teamId = parseInt(req.params.id);
      if (isNaN(teamId)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }

      // Count users in this team
      const teamUsers = await db.select().from(users).where(eq(users.teamId, teamId));
      const userIds = teamUsers.map(u => u.id);

      let postCount = 0;
      let mediaCount = 0;

      if (userIds.length > 0) {
        // Count posts by these users
        const userPosts = await db.select().from(posts).where(inArray(posts.userId, userIds));
        postCount = userPosts.length;

        // Count media files (posts with imageUrl or videoUrl)
        mediaCount = userPosts.filter(p => p.imageUrl || p.videoUrl).length;
      }

      res.json({
        userCount: teamUsers.length,
        postCount,
        mediaCount,
      });
    } catch (error) {
      logger.error(`Error getting team delete info ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to get team delete info",
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

      // Use database transaction for atomic deletion with cascade
      await db.transaction(async (tx) => {
        // Get all users in this team
        const teamUsers = await tx.select().from(users).where(eq(users.teamId, teamId));
        const userIds = teamUsers.map(u => u.id);

        if (userIds.length > 0) {
          // Get all posts with media to delete files from Object Storage
          const userPosts = await tx.select().from(posts).where(inArray(posts.userId, userIds));
          const mediaUrls = userPosts
            .filter(p => p.mediaUrl)
            .map(p => p.mediaUrl as string);

          // Delete media files from Object Storage
          for (const mediaUrl of mediaUrls) {
            try {
              await spartaStorage.deleteFile(mediaUrl);
              logger.info(`Deleted media file: ${mediaUrl}`);
            } catch (err) {
              logger.error(`Failed to delete media file ${mediaUrl}:`, err);
            }
          }

          // Get all messages sent or received by these users
          const userMessages = await tx.select().from(messages).where(
            or(
              inArray(messages.senderId, userIds),
              inArray(messages.recipientId, userIds)
            )
          );
          const messageMediaUrls = userMessages
            .filter(m => m.imageUrl)
            .map(m => m.imageUrl as string);

          // Delete message media files from Object Storage
          for (const mediaUrl of messageMediaUrls) {
            try {
              await spartaStorage.deleteFile(mediaUrl);
              logger.info(`Deleted message media file: ${mediaUrl}`);
            } catch (err) {
              logger.error(`Failed to delete message media file ${mediaUrl}:`, err);
            }
          }

          // Delete messages
          await tx.delete(messages).where(
            or(
              inArray(messages.senderId, userIds),
              inArray(messages.recipientId, userIds)
            )
          );
          logger.info(`Deleted messages for ${userIds.length} users in team ${teamId}`);

          // Delete reactions
          await tx.delete(reactions).where(inArray(reactions.userId, userIds));
          logger.info(`Deleted reactions for ${userIds.length} users in team ${teamId}`);

          // Delete all posts by these users
          await tx.delete(posts).where(inArray(posts.userId, userIds));
          logger.info(`Deleted posts for ${userIds.length} users in team ${teamId}`);

          // Delete all users in this team
          await tx.delete(users).where(inArray(users.id, userIds));
          logger.info(`Deleted ${userIds.length} users in team ${teamId}`);
        }

        // Finally delete the team
        await tx.delete(teams).where(eq(teams.id, teamId));
      });

      logger.info(`Team ${teamId} deleted successfully by user ${req.user.id}`);
      res.status(200).json({ message: "Team deleted successfully" });
    } catch (error) {
      logger.error(`Error deleting team ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to delete team",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Daily score check endpoints for notifications
  router.get("/api/check-daily-scores", async (req, res) => {
    try {
      const userId = parseInt(req.query.userId as string);
      const tzOffset = parseInt(req.query.tzOffset as string) || 0;

      if (isNaN(userId)) {
        return res.status(400).json({ message: "User ID is required" });
      }

      logger.info(`Manual check daily scores for user ${userId} with timezone offset ${tzOffset}`);

      // Forward to the post endpoint
      await checkDailyScores({ body: { userId, tzOffset } } as Request, res);
    } catch (error) {
      logger.error('Error in GET daily score check:', error);
      res.status(500).json({
        message: "Failed to check daily scores",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  router.post("/api/check-daily-scores", async (req, res) => {
    try {
      await checkDailyScores(req, res);
    } catch (error) {
      logger.error("Error in POST daily score check:", error);
      res.status(500).json({
        message: "Failed to check daily scores",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Test endpoint to force notification check (simulates user's notification time)
  router.post("/api/test-notification/:userId", authenticate, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Only admin can test notifications
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Only admins can test notifications" });
      }

      // Get the user's notification time
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const notificationTimeParts = user.notificationTime
        ? user.notificationTime.split(":")
        : ["8", "00"];
      const preferredHour = parseInt(notificationTimeParts[0]);
      const preferredMinute = parseInt(notificationTimeParts[1] || "0");

      logger.info(`Testing notification for user ${userId} at their preferred time ${preferredHour}:${preferredMinute}`);

      // Call checkDailyScores with the user's preferred time
      await checkDailyScores({ 
        body: { 
          currentHour: preferredHour, 
          currentMinute: preferredMinute 
        } 
      } as Request, res);
    } catch (error) {
      logger.error("Error in test notification:", error);
      res.status(500).json({
        message: "Failed to test notification",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Main function to check daily scores
  const checkDailyScores = async (req: Request, res: Response) => {
    try {
      logger.info("Starting daily score check with request body:", req.body);

      const currentHour = req.body?.currentHour !== undefined
        ? parseInt(req.body.currentHour)
        : new Date().getHours();

      const currentMinute = req.body?.currentMinute !== undefined
        ? parseInt(req.body.currentMinute)
        : new Date().getMinutes();

      logger.info(`Check daily scores at time: ${currentHour}:${currentMinute}`);

      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          isAdmin: users.isAdmin,
          teamId: users.teamId,
          notificationTime: users.notificationTime,
          timezoneOffset: users.timezoneOffset,
        })
        .from(users);

      logger.info(`Found ${Array.isArray(allUsers) ? allUsers.length : 0} users to check`);

      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const dayOfWeek = today.getDay();

      logger.info(`Checking points from ${yesterday.toISOString()} to ${today.toISOString()}`);

      for (const user of allUsers) {
        try {
          logger.info(`Processing user ${user.id} (${user.username})`);

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
                isNull(posts.parentId),
              ),
            );

          const userPosts = userPostsResult[0];
          const totalPoints = userPosts?.points || 0;
          const postTypes = userPosts?.types || [];
          const postCount = userPosts?.count || 0;

          const expectedPoints = dayOfWeek === 6 ? 22 : dayOfWeek === 0 ? 3 : 15;

          logger.info(`User ${user.id} (${user.username}) activity:`, {
            totalPoints,
            expectedPoints,
            postTypes,
            postCount,
            dayOfWeek,
            date: yesterday.toISOString(),
          });

          if (totalPoints < expectedPoints) {
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
                  isNull(posts.parentId),
                ),
              )
              .groupBy(posts.type);

            const counts: Record<string, number> = {
              food: 0,
              workout: 0,
              scripture: 0,
              memory_verse: 0,
            };

            postsByType.forEach((post) => {
              if (post.type in counts) {
                counts[post.type] = post.count;
              }
            });

            const missedItems = [];
            const yesterdayDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

            if (yesterdayDayOfWeek !== 0 && counts.food < 3) {
              missedItems.push(`${3 - counts.food} meals`);
            }

            if (yesterdayDayOfWeek !== 0 && counts.workout < 1) {
              missedItems.push("your workout");
            }

            if (counts.scripture < 1) {
              missedItems.push("your scripture reading");
            }

            if (yesterdayDayOfWeek === 6 && counts.memory_verse < 1) {
              missedItems.push("your memory verse");
            }

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

            const notificationTimeParts = user.notificationTime
              ? user.notificationTime.split(":")
              : ["8", "00"];
            const preferredLocalHour = parseInt(notificationTimeParts[0]);
            const preferredLocalMinute = parseInt(notificationTimeParts[1] || "0");

            // Convert user's local notification time to UTC
            // timezoneOffset is in minutes (e.g., -300 for EST which is UTC-5)
            // Negative offset means local time is BEHIND UTC
            // To convert local to UTC: UTC = local - offset
            // For EST: offset = -300 min = -5 hours
            // Example: 14:00 local - (-5) = 14:00 + 5 = 19:00 UTC
            const timezoneOffsetMinutes = user.timezoneOffset || 0;
            const timezoneOffsetHours = timezoneOffsetMinutes / 60;
            
            // Convert local time to UTC
            const preferredUTCHour = Math.floor((preferredLocalHour - timezoneOffsetHours + 24) % 24);
            const preferredUTCMinute = preferredLocalMinute;

            const isPreferredTimeWindow =
              (currentHour === preferredUTCHour &&
                currentMinute >= preferredUTCMinute &&
                currentMinute < preferredUTCMinute + 10) ||
              (currentHour === preferredUTCHour + 1 &&
                preferredUTCMinute >= 50 &&
                currentMinute < (preferredUTCMinute + 10) % 60);

            // Check if a notification was already sent in the last hour
            // This prevents duplicate notifications within the same scheduled time slot
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const recentNotifications = await db
              .select()
              .from(notifications)
              .where(
                and(
                  eq(notifications.userId, user.id),
                  eq(notifications.type, "reminder"),
                  gte(notifications.createdAt, oneHourAgo),
                ),
              );

            logger.info(`Notification time check for user ${user.id} (${user.username}):`, {
              userId: user.id,
              username: user.username,
              currentTime: `${currentHour}:${String(currentMinute).padStart(2, '0')} UTC`,
              preferredLocalTime: `${String(preferredLocalHour).padStart(2, '0')}:${String(preferredLocalMinute).padStart(2, '0')}`,
              preferredUTCTime: `${String(preferredUTCHour).padStart(2, '0')}:${String(preferredUTCMinute).padStart(2, '0')} UTC`,
              timezoneOffsetMinutes: timezoneOffsetMinutes,
              timezoneOffsetHours: timezoneOffsetHours,
              calculation: `(${preferredLocalHour} - (${timezoneOffsetHours}) + 24) % 24 = ${preferredUTCHour}`,
              isPreferredTimeWindow,
              recentNotifications: recentNotifications.length,
            });

            if (isPreferredTimeWindow && recentNotifications.length === 0) {
              const notification = {
                userId: user.id,
                title: "Daily Reminder",
                message,
                read: false,
                createdAt: new Date(),
                type: "reminder",
                sound: "default",
              };

              try {
                // Use try-catch to handle potential race conditions
                // Do a final check right before insert to catch concurrent creations
                const finalCheck = await db
                  .select()
                  .from(notifications)
                  .where(
                    and(
                      eq(notifications.userId, user.id),
                      eq(notifications.type, "reminder"),
                      gte(notifications.createdAt, oneHourAgo),
                    ),
                  );
                
                if (finalCheck.length > 0) {
                  logger.info(`User ${user.id} - race condition detected, notification exists. Skipping.`);
                  continue;
                }

                const [insertedNotification] = await db
                  .insert(notifications)
                  .values(notification)
                  .returning();

                logger.info(`Created notification for user ${user.id}:`, {
                  notificationId: insertedNotification.id,
                  userId: user.id,
                  message: notification.message,
                });

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
              } catch (insertError) {
                // If insert fails (e.g., race condition), log and continue
                logger.warn(`Failed to insert notification for user ${user.id}:`, insertError);
              }
            } else {
              if (!isPreferredTimeWindow) {
                logger.debug(`User ${user.id} - not in preferred time window`);
              } else if (recentNotifications.length > 0) {
                logger.info(`User ${user.id} - skipping duplicate notification (already sent ${recentNotifications.length} in last hour)`);
              }
            }
          } else {
            logger.info(`No notification needed for user ${user.id}, met daily goal`);
          }
        } catch (userError) {
          logger.error(`Error processing user ${user.id}:`, userError);
          continue;
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

  // Update team endpoint
  router.patch("/api/teams/:id", authenticate, async (req, res) => {
    try {
      const teamId = parseInt(req.params.id);
      if (isNaN(teamId)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }

      // Get the team first to check authorization
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check authorization: Admin or Group Admin for this team's group
      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisTeam = req.user?.isGroupAdmin && req.user?.adminGroupId === team.groupId;

      if (!isAdmin && !isGroupAdminForThisTeam) {
        logger.warn(`Unauthorized team edit attempt by user ${req.user?.id} (Group Admin for group ${req.user?.adminGroupId}) on team ${teamId} (in group ${team.groupId})`);
        return res.status(403).json({ 
          message: `Not authorized. You can only edit teams in your group (Group ID: ${req.user?.adminGroupId})` 
        });
      }

      logger.info(`Updating team ${teamId} with data:`, req.body);

      // Extract makeUsersInactive flag
      const { makeUsersInactive, ...updateData } = req.body;

      // Handle programStartDate conversion if it exists
      if (updateData.programStartDate !== undefined) {
        updateData.programStartDate = updateData.programStartDate 
          ? new Date(updateData.programStartDate) 
          : null;
      }

      // Update the team in the database first
      const [updatedTeam] = await db
        .update(teams)
        .set(updateData)
        .where(eq(teams.id, teamId))
        .returning();

      // If team is being set to inactive and makeUsersInactive is true, update users
      let usersUpdated = 0;
      if (updateData.status === 0 && makeUsersInactive) {
        logger.info(`Making users inactive for team ${teamId}, makeUsersInactive flag: ${makeUsersInactive}`);
        
        // First, check how many active users are in the team
        const activeUsersCheck = await db
          .select()
          .from(users)
          .where(
            and(
              eq(users.teamId, teamId),
              eq(users.status, 1)
            )
          );
        
        logger.info(`Found ${activeUsersCheck.length} active user(s) in team ${teamId} before update`);
        
        const updatedUsers = await db
          .update(users)
          .set({ status: 0 })
          .where(
            and(
              eq(users.teamId, teamId),
              eq(users.status, 1)
            )
          )
          .returning();
        
        usersUpdated = updatedUsers.length;
        logger.info(`Set ${usersUpdated} user(s) to inactive for team ${teamId}`);
        logger.info(`Updated user IDs: ${updatedUsers.map(u => u.id).join(', ')}`);
      }

      logger.info(`Team ${teamId} updated successfully by user ${req.user.id}`);
      
      // Return the team data with info about users updated
      res.status(200).json({
        ...updatedTeam,
        usersUpdated: usersUpdated > 0 ? usersUpdated : undefined
      });
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

  // Get organization deletion info (counts of what will be deleted)
  router.get("/api/organizations/:id/delete-info", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const organizationId = parseInt(req.params.id);
      if (isNaN(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID" });
      }

      // Get all groups in this organization
      const orgGroups = await storage.getGroupsByOrganization(organizationId);
      const groupIds = orgGroups.map(g => g.id);

      let teamCount = 0;
      let userCount = 0;
      let postCount = 0;
      let mediaCount = 0;

      if (groupIds.length > 0) {
        // Get all teams in these groups
        const teamsInGroups = await db.select().from(teams).where(inArray(teams.groupId, groupIds));
        teamCount = teamsInGroups.length;
        const teamIds = teamsInGroups.map(t => t.id);

        if (teamIds.length > 0) {
          // Get all users in these teams
          const usersInTeams = await db.select().from(users).where(inArray(users.teamId, teamIds));
          userCount = usersInTeams.length;
          const userIds = usersInTeams.map(u => u.id);

          if (userIds.length > 0) {
            // Count posts by these users
            const userPosts = await db.select().from(posts).where(inArray(posts.userId, userIds));
            postCount = userPosts.length;

            // Count media files
            mediaCount = userPosts.filter(p => p.imageUrl || p.videoUrl).length;
          }
        }
      }

      res.json({
        groupCount: orgGroups.length,
        teamCount,
        userCount,
        postCount,
        mediaCount,
      });
    } catch (error) {
      logger.error(`Error getting organization delete info ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to get organization delete info",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Delete organization endpoint
  router.delete("/api/organizations/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const organizationId = parseInt(req.params.id);
      if (isNaN(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID" });
      }

      logger.info(`Deleting organization ${organizationId} by user ${req.user.id}`);

      // Use database transaction for atomic deletion with cascade
      await db.transaction(async (tx) => {
        // Get all groups in this organization
        const orgGroups = await storage.getGroupsByOrganization(organizationId);
        const groupIds = orgGroups.map(g => g.id);

        if (groupIds.length > 0) {
          // Get all teams in these groups
          const teamsInGroups = await tx.select().from(teams).where(inArray(teams.groupId, groupIds));
          const teamIds = teamsInGroups.map(t => t.id);

          if (teamIds.length > 0) {
            // Get all users in these teams
            const usersInTeams = await tx.select().from(users).where(inArray(users.teamId, teamIds));
            const userIds = usersInTeams.map(u => u.id);

            if (userIds.length > 0) {
              // Get all posts with media to delete files from Object Storage
              const userPosts = await tx.select().from(posts).where(inArray(posts.userId, userIds));
              const mediaUrls = userPosts
                .filter(p => p.mediaUrl)
                .map(p => p.mediaUrl as string);

              // Delete media files from Object Storage
              for (const mediaUrl of mediaUrls) {
                try {
                  await spartaStorage.deleteFile(mediaUrl);
                  logger.info(`Deleted media file: ${mediaUrl}`);
                } catch (err) {
                  logger.error(`Failed to delete media file ${mediaUrl}:`, err);
                }
              }

              // Get all messages sent or received by these users
              const userMessages = await tx.select().from(messages).where(
                or(
                  inArray(messages.senderId, userIds),
                  inArray(messages.recipientId, userIds)
                )
              );
              const messageMediaUrls = userMessages
                .filter(m => m.imageUrl)
                .map(m => m.imageUrl as string);

              // Delete message media files from Object Storage
              for (const mediaUrl of messageMediaUrls) {
                try {
                  await spartaStorage.deleteFile(mediaUrl);
                  logger.info(`Deleted message media file: ${mediaUrl}`);
                } catch (err) {
                  logger.error(`Failed to delete message media file ${mediaUrl}:`, err);
                }
              }

              // Delete messages
              await tx.delete(messages).where(
                or(
                  inArray(messages.senderId, userIds),
                  inArray(messages.recipientId, userIds)
                )
              );
              logger.info(`Deleted messages for ${userIds.length} users in organization ${organizationId}`);

              // Delete reactions
              await tx.delete(reactions).where(inArray(reactions.userId, userIds));
              logger.info(`Deleted reactions for ${userIds.length} users in organization ${organizationId}`);

              // Delete all posts by these users
              await tx.delete(posts).where(inArray(posts.userId, userIds));
              logger.info(`Deleted posts for ${userIds.length} users in organization ${organizationId}`);

              // Delete all users in these teams
              await tx.delete(users).where(inArray(users.id, userIds));
              logger.info(`Deleted ${userIds.length} users for organization ${organizationId}`);
            }

            // Delete all teams in these groups
            await tx.delete(teams).where(inArray(teams.id, teamIds));
            logger.info(`Deleted ${teamIds.length} teams for organization ${organizationId}`);
          }

          // Delete all groups in this organization
          await tx.delete(groups).where(inArray(groups.id, groupIds));
          logger.info(`Deleted ${groupIds.length} groups for organization ${organizationId}`);
        }

        // Finally delete the organization
        await tx.delete(organizations).where(eq(organizations.id, organizationId));
      });

      logger.info(`Organization ${organizationId} deleted successfully by user ${req.user.id}`);
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

        let groupsUpdated = 0;
        let teamsUpdated = 0;
        let usersUpdated = 0;

        // If organization status is being set to inactive (0), cascade to all groups, teams, and users
        if (req.body.status === 0) {
          logger.info(`Organization ${organizationId} set to inactive, cascading status updates...`);

          // Get all groups in this organization
          const orgGroups = await storage.getGroupsByOrganization(organizationId);
          const groupIds = orgGroups.map(g => g.id);

          if (groupIds.length > 0) {
            // Update all groups in this organization to inactive
            await tx.update(groups).set({ status: 0 }).where(inArray(groups.id, groupIds));
            groupsUpdated = groupIds.length;
            logger.log(`Set ${groupIds.length} groups to inactive for organization ${organizationId}`);

            // Get all teams in these groups
            const teamsInGroups = await tx.select().from(teams).where(inArray(teams.groupId, groupIds));
            const teamIds = teamsInGroups.map(t => t.id);

            if (teamIds.length > 0) {
              // Update all teams in these groups to inactive
              await tx.update(teams).set({ status: 0 }).where(inArray(teams.id, teamIds));
              teamsUpdated = teamIds.length;
              logger.info(`Set ${teamIds.length} teams to inactive for organization ${organizationId}`);

              // Get all users in these teams and update them to inactive
              const usersInTeams = await tx.select().from(users).where(inArray(users.teamId, teamIds));
              const userIds = usersInTeams.map(u => u.id);

              if (userIds.length > 0) {
                await tx.update(users).set({ status: 0 }).where(inArray(users.id, userIds));
                usersUpdated = userIds.length;
                logger.info(`Set ${userIds.length} users to inactive for organization ${organizationId}`);
              }
            }
          }
        }

        return { 
          ...updatedOrganization, 
          groupsUpdated, 
          teamsUpdated, 
          usersUpdated 
        };
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

  // Get group deletion info (counts of what will be deleted)
  router.get("/api/groups/:id/delete-info", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const groupId = parseInt(req.params.id);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid group ID" });
      }

      // Get all teams in this group
      const groupTeams = await db.select().from(teams).where(eq(teams.groupId, groupId));
      const teamIds = groupTeams.map(t => t.id);

      let userCount = 0;
      let postCount = 0;
      let mediaCount = 0;

      if (teamIds.length > 0) {
        // Get all users in these teams
        const teamUsers = await db.select().from(users).where(inArray(users.teamId, teamIds));
        userCount = teamUsers.length;
        const userIds = teamUsers.map(u => u.id);

        if (userIds.length > 0) {
          // Count posts by these users
          const userPosts = await db.select().from(posts).where(inArray(posts.userId, userIds));
          postCount = userPosts.length;

          // Count media files
          mediaCount = userPosts.filter(p => p.imageUrl || p.videoUrl).length;
        }
      }

      res.json({
        teamCount: groupTeams.length,
        userCount,
        postCount,
        mediaCount,
      });
    } catch (error) {
      logger.error(`Error getting group delete info ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to get group delete info",
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

      logger.info(`Deleting group ${groupId} by user ${req.user.id}`);

      // Use database transaction for atomic deletion with cascade
      await db.transaction(async (tx) => {
        // Get all teams in this group
        const groupTeams = await tx.select().from(teams).where(eq(teams.groupId, groupId));
        const teamIds = groupTeams.map(t => t.id);

        if (teamIds.length > 0) {
          // Get all users in these teams
          const teamUsers = await tx.select().from(users).where(inArray(users.teamId, teamIds));
          const userIds = teamUsers.map(u => u.id);

          if (userIds.length > 0) {
            // Get all posts with media to delete files from Object Storage
            const userPosts = await tx.select().from(posts).where(inArray(posts.userId, userIds));
            const mediaUrls = userPosts
              .filter(p => p.mediaUrl)
              .map(p => p.mediaUrl as string);

            // Delete media files from Object Storage
            for (const mediaUrl of mediaUrls) {
              try {
                await spartaStorage.deleteFile(mediaUrl);
                logger.info(`Deleted media file: ${mediaUrl}`);
              } catch (err) {
                logger.error(`Failed to delete media file ${mediaUrl}:`, err);
              }
            }

            // Get all messages sent or received by these users
            const userMessages = await tx.select().from(messages).where(
              or(
                inArray(messages.senderId, userIds),
                inArray(messages.recipientId, userIds)
              )
            );
            const messageMediaUrls = userMessages
              .filter(m => m.imageUrl)
              .map(m => m.imageUrl as string);

            // Delete message media files from Object Storage
            for (const mediaUrl of messageMediaUrls) {
              try {
                await spartaStorage.deleteFile(mediaUrl);
                logger.info(`Deleted message media file: ${mediaUrl}`);
              } catch (err) {
                logger.error(`Failed to delete message media file ${mediaUrl}:`, err);
              }
            }

            // Delete messages
            await tx.delete(messages).where(
              or(
                inArray(messages.senderId, userIds),
                inArray(messages.recipientId, userIds)
              )
            );
            logger.info(`Deleted messages for ${userIds.length} users in group ${groupId}`);

            // Delete reactions
            await tx.delete(reactions).where(inArray(reactions.userId, userIds));
            logger.info(`Deleted reactions for ${userIds.length} users in group ${groupId}`);

            // Delete all posts by these users
            await tx.delete(posts).where(inArray(posts.userId, userIds));
            logger.info(`Deleted posts for ${userIds.length} users in group ${groupId}`);

            // Delete all users in these teams
            await tx.delete(users).where(inArray(users.id, userIds));
            logger.info(`Deleted ${userIds.length} users in group ${groupId}`);
          }

          // Delete all teams in this group
          await tx.delete(teams).where(inArray(teams.id, teamIds));
          logger.info(`Deleted ${teamIds.length} teams in group ${groupId}`);
        }

        // Finally delete the group
        await tx.delete(groups).where(eq(groups.id, groupId));
      });

      logger.info(`Group ${groupId} deleted successfully by user ${req.user.id}`);
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
      const groupId = parseInt(req.params.id);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid group ID" });
      }

      // Check authorization
      const isFullAdmin = req.user?.isAdmin;
      const isGroupAdminForThisGroup = req.user?.isGroupAdmin && req.user?.adminGroupId === groupId;

      logger.info(`Group update attempt by user ${req.user?.id}:`, {
        groupId,
        isFullAdmin,
        isGroupAdmin: req.user?.isGroupAdmin,
        adminGroupId: req.user?.adminGroupId,
        isGroupAdminForThisGroup,
        requestBody: req.body
      });

      if (!isFullAdmin && !isGroupAdminForThisGroup) {
        logger.warn(`Authorization failed for user ${req.user?.id} on group ${groupId}`);

        // Set content type before any response
        res.setHeader("Content-Type", "application/json");

        // Provide helpful error message for Group Admins
        if (req.user?.isGroupAdmin && req.user?.adminGroupId) {
          // Get the group name they are authorized for
          const [authorizedGroup] = await db
            .select({ name: groups.name })
            .from(groups)
            .where(eq(groups.id, req.user.adminGroupId))
            .limit(1);

          const groupName = authorizedGroup?.name || `Group ${req.user.adminGroupId}`;
          return res.status(403).json({
            message: `Not authorized to make changes to this group. You are Group Admin for ${groupName} only.`
          });
        }

        return res.status(403).json({ message: "Not authorized" });
      }

      // Validate status field if present (only Full Admins can change status)
      if (req.body.status !== undefined) {
        if (!isFullAdmin) {
          return res.status(403).json({ message: "Only Full Admins can change group status" });
        }
        const statusSchema = z.object({ status: z.number().int().min(0).max(1) });
        const statusValidation = statusSchema.safeParse({ status: req.body.status });
        if (!statusValidation.success) {
          return res.status(400).json({ message: "Status must be 0 or 1" });
        }
      }

      // Group Admins can only update certain fields (not organizationId or status)
      let updateData: any = {};
      if (isGroupAdminForThisGroup && !isFullAdmin) {
        // Group admins can only update name, description, competitive status, and program start date
        const { name, description, competitive, programStartDate } = req.body;
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (competitive !== undefined) updateData.competitive = competitive;
        if (programStartDate !== undefined) updateData.programStartDate = programStartDate ? new Date(programStartDate) : null;

        logger.info(`Group Admin filtered update data for group ${groupId}:`, updateData);
      } else {
        // Full admins can update everything
        updateData = { ...req.body };
        // Convert programStartDate to Date object if present
        if (updateData.programStartDate !== undefined) {
          updateData.programStartDate = updateData.programStartDate ? new Date(updateData.programStartDate) : null;
        }
      }

      // Ensure we have something to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Use database transaction for atomic updates
      const result = await db.transaction(async (tx) => {
        // Update the group using transaction
        const [updatedGroup] = await tx
          .update(groups)
          .set(updateData)
          .where(eq(groups.id, groupId))
          .returning();

        let teamsUpdated = 0;
        let usersUpdated = 0;

        // If group status is being set to inactive (0), cascade to all teams and users
        if (req.body.status === 0) {
          logger.info(`Group ${groupId} set to inactive, cascading status updates...`);

          // Get all teams in this group
          const teamsInGroup = await tx.select().from(teams).where(eq(teams.groupId, groupId));
          const teamIds = teamsInGroup.map(t => t.id);

          if (teamIds.length > 0) {
            // Update all teams in this group to inactive
            await tx.update(teams).set({ status: 0 }).where(inArray(teams.id, teamIds));
            teamsUpdated = teamIds.length;
            logger.info(`Set ${teamIds.length} teams to inactive for group ${groupId}`);

            // Get all users in these teams and update them to inactive
            const usersInTeams = await tx.select().from(users).where(inArray(users.teamId, teamIds));
            const userIds = usersInTeams.map(u => u.id);

            if (userIds.length > 0) {
              await tx.update(users).set({ status: 0 }).where(inArray(users.id, userIds));
              usersUpdated = userIds.length;
              logger.info(`Set ${userIds.length} users to inactive for group ${groupId}`);
            }
          }
        }

        return { 
          ...updatedGroup, 
          teamsUpdated, 
          usersUpdated 
        };
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

  // Invite Code endpoints
  // Generate invite code for Group Admin
  router.post("/api/invite-codes/group-admin/:groupId", authenticate, async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid group ID" });
      }

      // Check if user is admin or group admin for this group
      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisGroup = req.user?.isGroupAdmin && req.user?.adminGroupId === groupId;

      if (!isAdmin && !isGroupAdminForThisGroup) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Generate unique code
      const code = `GA-${groupId}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      // Update the group with the new invite code
      const [updatedGroup] = await db
        .update(groups)
        .set({ groupAdminInviteCode: code })
        .where(eq(groups.id, groupId))
        .returning();

      if (!updatedGroup) {
        return res.status(404).json({ message: "Group not found" });
      }

      res.status(201).json({ code, type: "group_admin" });
    } catch (error) {
      logger.error("Error creating group admin invite code:", error);
      res.status(500).json({ message: "Failed to create invite code" });
    }
  });

  // Generate invite code for Team Lead
  router.post("/api/invite-codes/team-admin/:teamId", authenticate, async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      if (isNaN(teamId)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }

      // Get team to check group ownership
      const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check if user is admin or group admin for this team's group
      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisTeam = req.user?.isGroupAdmin && req.user?.adminGroupId === team.groupId;

      if (!isAdmin && !isGroupAdminForThisTeam) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Generate unique code
      const code = `TA-${teamId}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      // Update the team with the new invite code
      const [updatedTeam] = await db
        .update(teams)
        .set({ teamAdminInviteCode: code })
        .where(eq(teams.id, teamId))
        .returning();

      if (!updatedTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      res.status(201).json({ code, type: "team_admin" });
    } catch (error) {
      logger.error("Error creating team admin invite code:", error);
      res.status(500).json({ message: "Failed to create invite code" });
    }
  });

  // Generate invite code for Team Member
  router.post("/api/invite-codes/team-member/:teamId", authenticate, async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      if (isNaN(teamId)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }

      // Get team to check group ownership
      const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check if user is admin or group admin for this team's group
      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisTeam = req.user?.isGroupAdmin && req.user?.adminGroupId === team.groupId;

      if (!isAdmin && !isGroupAdminForThisTeam) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Generate unique code
      const code = `TM-${teamId}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      // Update the team with the new invite code
      const [updatedTeam] = await db
        .update(teams)
        .set({ teamMemberInviteCode: code })
        .where(eq(teams.id, teamId))
        .returning();

      if (!updatedTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      res.status(201).json({ code, type: "team_member" });
    } catch (error) {
      logger.error("Error creating team member invite code:", error);
      res.status(500).json({ message: "Failed to create invite code" });
    }
  });

  // Get invite codes for a group
  router.get("/api/invite-codes/group/:groupId", authenticate, async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid group ID" });
      }

      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisGroup = req.user?.isGroupAdmin && req.user?.adminGroupId === groupId;

      if (!isAdmin && !isGroupAdminForThisGroup) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const [group] = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);

      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }

      const codes = [];
      if (group.groupAdminInviteCode) {
        codes.push({ code: group.groupAdminInviteCode, type: "group_admin" });
      }

      res.json(codes);
    } catch (error) {
      logger.error("Error fetching group invite codes:", error);
      res.status(500).json({ message: "Failed to fetch invite codes" });
    }
  });

  // Get invite codes for a team
  router.get("/api/invite-codes/team/:teamId", authenticate, async (req, res) => {
    try {
      const teamId = parseInt(req.params.teamId);
      if (isNaN(teamId)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }

      const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisTeam = req.user?.isGroupAdmin && req.user?.adminGroupId === team.groupId;

      if (!isAdmin && !isGroupAdminForThisTeam) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const codes = [];
      if (team.teamAdminInviteCode) {
        codes.push({ code: team.teamAdminInviteCode, type: "team_admin" });
      }
      if (team.teamMemberInviteCode) {
        codes.push({ code: team.teamMemberInviteCode, type: "team_member" });
      }

      res.json(codes);
    } catch (error) {
      logger.error("Error fetching team invite codes:", error);
      res.status(500).json({ message: "Failed to fetch invite codes" });
    }
  });

  // Redeem/use an invite code - MOVED to invite-code-routes.ts to avoid duplication

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
              // Match Bible verses with chapter:verse OR just chapter OR chapter ranges (e.g., "Acts 1", "Acts 1:1-5", or "Genesis 33-34")
              // This regex now handles full chapters, specific verses, and chapter ranges
              const bibleVerseRegex = /\b(?:(?:1|2|3)\s+)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|(?:1|2)\s*Samuel|(?:1|2)\s*Kings|(?:1|2)\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song\s+of\s+Songs?|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|(?:1|2)\s*Corinthians|Galatians?|Galation|Ephesians|Philippians|Colossians|(?:1|2)\s*Thessalonians|(?:1|2)\s*Timothy|Titus|Philemon|Hebrews|James|(?:1|2)\s*Peter|(?:1|2|3)\s*John|Jude|Revelation)\s+\d+(?:-\d+)?(?:\s*:\s*(?:Verses?\s+)?\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)?)*\b/gi;

              const originalContent = field.content;
              field.content = field.content.replace(bibleVerseRegex, (match) => {
                // Map book names to 3-letter abbreviations
                const bookMap: { [key: string]: string } = {
                  'Genesis': 'GEN', 'Exodus': 'EXO', 'Leviticus': 'LEV', 'Numbers': 'NUM', 'Deuteronomy': 'DEU',
                  'Joshua': 'JOS', 'Judges': 'JDG', 'Ruth': 'RUT', '1 Samuel': '1SA', '2 Samuel': '2SA',
                  '1 Kings': '1KI', '2 Kings': '2KI', '1 Chronicles': '1CH', '2 Chronicles': '2CH',
                  'Ezra': 'EZR', 'Nehemiah': 'NEH', 'Esther': 'EST', 'Job': 'JOB', 'Psalm': 'PSA', 'Psalms': 'PSA',
                  'Proverbs': 'PRO', 'Ecclesiastes': 'ECC', 'Song of Songs': 'SNG', 'Isaiah': 'ISA',
                  'Jeremiah': 'JER', 'Lamentations': 'LAM', 'Ezekiel': 'EZK', 'Daniel': 'DAN',
                  'Hosea': 'HOS', 'Joel': 'JOL', 'Amos': 'AMO', 'Obadiah': 'OBA', 'Jonah': 'JON',
                  'Micah': 'MIC', 'Nahum': 'NAM', 'Habakkuk': 'HAB', 'Zephaniah': 'ZEP', 'Haggai': 'HAG',
                  'Zechariah': 'ZEC', 'Malachi': 'MAL', 'Matthew': 'MAT', 'Mark': 'MRK', 'Luke': 'LUK',
                  'John': 'JHN', 'Acts': 'ACT', 'Romans': 'ROM', '1 Corinthians': '1CO', '2 Corinthians': '2CO',
                  'Galatians': 'GAL', 'Galation': 'GAL', 'Ephesians': 'EPH', 'Philippians': 'PHP', 'Colossians': 'COL',
                  '1 Thessalonians': '1TH', '2 Thessalonians': '2TH', '1 Timothy': '1TI', '2 Timothy': '2TI',
                  'Titus': 'TIT', 'Philemon': 'PHM', 'Hebrews': 'HEB', 'James': 'JAS', '1 Peter': '1PE',
                  '2 Peter': '2PE', '1 John': '1JN', '2 John': '2JN', '3 John': '3JN', 'Jude': 'JUD', 'Revelation': 'REV'
                };

                // Extract book name and reference (e.g., "John 5:1-18" -> book="John", ref="5:1-18")
                // Also handles chapter ranges like "Genesis 33-34" and comma lists like "Psalms 29, 59, 89, 149"
                const parts = match.match(/^(.+?)\s+(\d+.*)$/);
                if (parts) {
                  const bookName = parts[1].trim();
                  const reference = parts[2].trim();
                  const bookAbbr = bookMap[bookName] || bookName;

                  // Check if this is a comma-separated chapter list (e.g., "30, 60, 90, 120")
                  // The reference might be just numbers or include other text after
                  const commaChaptersMatch = reference.match(/^(\d+(?:\s*,\s*\d+)+)(?:\s|$)/);
                  if (commaChaptersMatch) {
                    const chapters = commaChaptersMatch[1].split(',').map(ch => ch.trim());
                    const links = chapters.map(chapter => {
                      const url = `https://www.bible.com/bible/111/${bookAbbr}.${chapter}.NIV`;
                      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${chapter}</a>`;
                    });

                    // Get any remaining text after the comma list
                    const remainingText = reference.substring(commaChaptersMatch[0].length).trim();
                    const result = `${bookName} ${links.join(', ')}${remainingText ? ' ' + remainingText : ''}`;
                    return result;
                  }

                  // Format: https://www.bible.com/bible/111/JHN.5.1-18.NIV or GEN.33-34.NIV
                  // Replace colons with dots but preserve hyphens for chapter/verse ranges
                  const formattedRef = reference.replace(/:/g, '.');
                  const bibleUrl = `https://www.bible.com/bible/111/${bookAbbr}.${formattedRef}.NIV`;
                  return `<a href="${bibleUrl}" target="_blank" rel="noopener noreferrer">${match}</a>`;
                }

                return match;
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

  // Delete Week 2 Day 0 activity (one-time cleanup)
  router.delete("/api/activities/week2-day0", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Delete Week 2, Day 0 activities
      const deleted = await db
        .delete(activities)
        .where(
          and(
            eq(activities.week, 2),
            eq(activities.day, 0)
          )
        )
        .returning();

      logger.info(`Deleted ${deleted.length} Week 2 Day 0 activities`);
      res.json({ message: "Week 2 Day 0 activities deleted", count: deleted.length });
    } catch (error) {
      logger.error("Error deleting Week 2 Day 0:", error);
      res.status(500).json({
        message: "Failed to delete activities",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get current activity week and day
  router.get("/api/activities/current", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Get timezone offset from query params (in minutes)
      const tzOffset = parseInt(req.query.tzOffset as string) || 0;

      // Get user with programStartDate
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user has a program start date
      if (!user.programStartDate) {
        // If no program start date, use "next Monday" logic
        // Get current date in user's timezone
        const now = new Date();
        const userLocalNow = new Date(now.getTime() - tzOffset * 60000);

        // Get current day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
        const currentDayOfWeek = userLocalNow.getDay();

        // Calculate the "next Monday" (or today if today is Monday)
        const daysUntilMonday = currentDayOfWeek === 0 ? 1 : currentDayOfWeek === 1 ? 0 : 8 - currentDayOfWeek;
        const nextMonday = new Date(userLocalNow);
        nextMonday.setDate(userLocalNow.getDate() + daysUntilMonday);
        nextMonday.setHours(0, 0, 0, 0);

        // Set to start of day in user's timezone
        const userStartOfDay = new Date(userLocalNow);
        userStartOfDay.setHours(0, 0, 0, 0);

        // Program has started if today is Monday or later (nextMonday <= today)
        const programHasStarted = nextMonday.getTime() <= userStartOfDay.getTime();

        // Calculate current day of week (1 = Monday, 7 = Sunday)
        const rawDay = userLocalNow.getDay();
        const currentDay = rawDay === 0 ? 7 : rawDay;

        return res.json({
          currentWeek: 1,
          currentDay: currentDay,
          programHasStarted: programHasStarted,
          daysSinceStart: programHasStarted ? 0 : -daysUntilMonday
        });
      }

      // Get current date in user's timezone
      const now = new Date();
      const userLocalNow = new Date(now.getTime() - tzOffset * 60000);

      // Set to start of day in user's timezone
      const userStartOfDay = new Date(userLocalNow);
      userStartOfDay.setHours(0, 0, 0, 0);

      // Program start date (from database) - ensure it's at start of day
      const programStart = new Date(user.programStartDate);
      programStart.setHours(0, 0, 0, 0);

      // Calculate days since program start
      const msSinceStart = userStartOfDay.getTime() - programStart.getTime();
      const daysSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60 * 24));

      // Calculate current week (1-based)
      const currentWeek = Math.floor(daysSinceStart / 7) + 1;

      // Calculate current day of week (1 = Monday, 7 = Sunday)
      const rawDay = userLocalNow.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const currentDay = rawDay === 0 ? 7 : rawDay;

      // Check if program has started - true if daysSinceStart is 0 or positive
      const programHasStarted = !!(user.programStartDate && daysSinceStart >= 0);

      // Don't allow negative weeks/days
      const week = Math.max(1, currentWeek);
      const day = Math.max(1, currentDay);

      res.json({
        currentWeek: week,
        currentDay: day,
        programStartDate: user.programStartDate,
        daysSinceStart: Math.max(0, daysSinceStart),
        programHasStarted: !!programHasStarted
      });
    } catch (error) {
      logger.error("Error getting current activity:", error);
      res.status(500).json({
        message: "Failed to get current activity",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add messages endpoints before return statement
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

  // Update user preferred name
  router.patch("/api/user/preferred-name", authenticate, async (req, res) => {
    try {
      console.log("[ROUTE HIT] PATCH /api/user/preferred-name", req.body);
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { preferredName } = req.body;
      console.log("[UPDATING] preferredName for user", req.user.id, "to", preferredName);

      // Update user's preferred name
      const [updatedUser] = await db
        .update(users)
        .set({ preferredName })
        .where(eq(users.id, req.user.id))
        .returning();

      console.log("[UPDATE RESULT]", updatedUser);
      logger.info(`User ${req.user.id} updated preferred name to ${preferredName}`);

      res.json({
        message: "Preferred name updated successfully",
        preferredName: updatedUser.preferredName,
      });
    } catch (error) {
      console.error("[ERROR] updating preferred name:", error);
      logger.error("Error updating preferred name:", error);
      res.status(500).json({
        message: "Failed to update preferred name",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update user email
  router.patch("/api/user/email", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Check if email is already in use by another user
      const [existingUser] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email), ne(users.id, req.user.id)))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ message: "Email is already in use" });
      }

      // Update user's email
      const [updatedUser] = await db
        .update(users)
        .set({ email })
        .where(eq(users.id, req.user.id))
        .returning();

      logger.info(`User ${req.user.id} updated email to ${email}`);

      res.json({
        message: "Email updated successfully",
        email: updatedUser.email,
      });
    } catch (error) {
      logger.error("Error updating email:", error);
      res.status(500).json({
        message: "Failed to update email",
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

        const { notificationTime, achievementNotificationsEnabled, timezoneOffset } = req.body;
        // Define update data with proper typing
        const updateData: {
          notificationTime?: string;
          achievementNotificationsEnabled?: boolean;
          timezoneOffset?: number;
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

        // Add timezone offset if provided (in minutes)
        if (timezoneOffset !== undefined) {
          updateData.timezoneOffset = parseInt(timezoneOffset);
          logger.info(`Updating timezone offset for user ${req.user.id} to ${timezoneOffset} minutes`);
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

  // Re-engage endpoint - allows users to restart from a previous week
  router.post("/api/users/reengage", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { targetWeek } = req.body;

      if (!targetWeek || targetWeek < 1) {
        return res.status(400).json({ message: "Invalid target week" });
      }

      // Get user's current program start date
      const [currentUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!currentUser || !currentUser.programStartDate) {
        return res.status(400).json({ message: "User program not initialized" });
      }

      // Calculate today's day of the week (1=Monday, 7=Sunday)
      const today = new Date();
      const todayDayOfWeek = today.getDay();
      // Convert JavaScript's 0=Sunday to our 1=Monday system
      const currentDayNumber = todayDayOfWeek === 0 ? 7 : todayDayOfWeek;

      // Calculate new program_start_date
      // Target: Week W Day D should be today
      // Days from program start to target position: (W-1)*7 + (D-1)
      const daysFromStart = (targetWeek - 1) * 7 + (currentDayNumber - 1);

      // new_start_date = today - daysFromStart
      const newProgramStartDate = new Date(today);
      newProgramStartDate.setDate(today.getDate() - daysFromStart);
      // Set to midnight
      newProgramStartDate.setHours(0, 0, 0, 0);

      // Calculate the cutoff date for deleting posts
      // This is the date that represents targetWeek, currentDayNumber
      const cutoffDate = new Date(newProgramStartDate);
      cutoffDate.setDate(newProgramStartDate.getDate() + daysFromStart);
      cutoffDate.setHours(0, 0, 0, 0);

      logger.info(`Re-engage: User ${req.user.id} restarting at Week ${targetWeek}`);
      logger.info(`Today is day ${currentDayNumber} of the week`);
      logger.info(`New program start date: ${newProgramStartDate.toISOString()}`);
      logger.info(`Deleting posts from ${cutoffDate.toISOString()} onwards`);

      // First, get all posts that will be deleted to clean up their media
      const postsToDelete = await db
        .select({
          id: posts.id,
          mediaUrl: posts.mediaUrl,
          is_video: posts.is_video
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, req.user.id),
            gte(posts.createdAt, cutoffDate)
          )
        );

      logger.info(`Found ${postsToDelete.length} posts to delete for user ${req.user.id}`);

      // Delete media files for each post before deleting the posts
      if (postsToDelete.length > 0) {
        const { spartaStorage } = await import('./sparta-object-storage');

        for (const post of postsToDelete) {
          if (post.mediaUrl) {
            try {
              // Extract filename from mediaUrl
              let filename = '';
              if (post.mediaUrl.includes('filename=')) {
                const urlParams = new URLSearchParams(post.mediaUrl.split('?')[1]);
                filename = urlParams.get('filename') || '';
              } else {
                filename = post.mediaUrl.split('/').pop() || '';
              }

              if (filename) {
                const filePath = `shared/uploads/${filename}`;

                // Delete main media file
                try {
                  await spartaStorage.deleteFile(filePath);
                  logger.info(`Deleted media file: ${filePath} for post ${post.id}`);
                } catch (err) {
                  logger.error(`Could not delete media file ${filePath}: ${err}`);
                }

                // If it's a video, also delete the thumbnail
                if (post.is_video) {
                  const baseName = filename.substring(0, filename.lastIndexOf('.'));
                  const thumbnailPath = `shared/uploads/${baseName}.jpg`;

                  try {
                    await spartaStorage.deleteFile(thumbnailPath);
                    logger.info(`Deleted video thumbnail: ${thumbnailPath} for post ${post.id}`);
                  } catch (err) {
                    logger.error(`Could not delete thumbnail ${thumbnailPath}: ${err}`);
                  }
                }
              }
            } catch (err) {
              logger.error(`Error deleting media for post ${post.id}:`, err);
            }
          }
        }
      }

      // Now delete the posts from the database
      const deletedPosts = await db
        .delete(posts)
        .where(
          and(
            eq(posts.userId, req.user.id),
            gte(posts.createdAt, cutoffDate)
          )
        )
        .returning();

      logger.info(`Deleted ${deletedPosts.length} posts from database for user ${req.user.id}`);

      // Update user's program_start_date
      await db
        .update(users)
        .set({ programStartDate: newProgramStartDate })
        .where(eq(users.id, req.user.id));

      // Recalculate points for the user
      const userPosts = await db
        .select()
        .from(posts)
        .where(eq(posts.userId, req.user.id));

      const totalPoints = userPosts.reduce((sum, post) => sum + (post.points || 0), 0);

      await db
        .update(users)
        .set({ points: totalPoints })
        .where(eq(users.id, req.user.id));

      logger.info(`Recalculated points for user ${req.user.id}: ${totalPoints}`);

      res.json({
        message: "Program successfully reset",
        newProgramStartDate,
        deletedPostsCount: deletedPosts.length,
        newPoints: totalPoints,
        currentWeek: targetWeek,
        currentDay: currentDayNumber,
      });
    } catch (error) {
      logger.error("Error in re-engage:", error);
      res.status(500).json({
        message: "Failed to re-engage program",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add endpoint for measurements
  router.get("/api/measurements", authenticate, async (req, res) => {
    try {
      console.log("[ROUTER.GET MEASUREMENTS] Route hit, user:", req.user?.id, "query:", req.query);
      if (!req.user) {
        console.log("[ROUTER.GET MEASUREMENTS] Unauthorized");
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = req.query.userId ? parseInt(req.query.userId as string) : req.user.id;
      console.log("[ROUTER.GET MEASUREMENTS] Fetching measurements for userId:", userId);

      // Get all measurements for the user, ordered by date descending
      const userMeasurements = await db
        .select()
        .from(measurements)
        .where(eq(measurements.userId, userId))
        .orderBy(desc(measurements.date));

      console.log("[ROUTER.GET MEASUREMENTS] Found measurements:", userMeasurements.length, "records");
      console.log("[ROUTER.GET MEASUREMENTS] Data:", JSON.stringify(userMeasurements));
      res.json(userMeasurements);
    } catch (error) {
      console.error("[ROUTER.GET MEASUREMENTS] Error:", error);
      logger.error("Error fetching measurements:", error);
      res.status(500).json({
        message: "Failed to fetch measurements",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add measurements POST route directly on app to ensure it executes
  app.post("/api/measurements", authenticate, async (req, res) => {
    try {
      console.log("[APP.POST MEASUREMENTS] Route hit, user:", req.user?.id, "body:", req.body);
      if (!req.user) {
        console.log("[APP.POST MEASUREMENTS] Unauthorized");
        return res.status(401).json({ message: "Unauthorized" });
      }

      const parsed = insertMeasurementSchema.safeParse({
        ...req.body,
        userId: req.user.id,
      });

      console.log("[APP.POST MEASUREMENTS] Validation result:", parsed.success ? "SUCCESS" : "FAILED", parsed.success ? "" : parsed.error.errors);

      if (!parsed.success) {
        console.log("[APP.POST MEASUREMENTS] Validation failed:", parsed.error.errors);
        return res.status(400).json({
          message: "Invalid measurement data",
          errors: parsed.error.errors,
        });
      }

      // Always create a new measurement (historical log)
      const [measurement] = await db
        .insert(measurements)
        .values(parsed.data)
        .returning();

      console.log("[APP.POST MEASUREMENTS] Created measurement:", measurement);
      logger.info(`User ${req.user.id} created new measurement: weight=${parsed.data.weight}, waist=${parsed.data.waist}`);

      console.log("[APP.POST MEASUREMENTS] Sending response:", measurement);
      res.json(measurement);
    } catch (error) {
      console.error("[APP.POST MEASUREMENTS] Error:", error);
      logger.error("Error adding/updating measurement:", error);
      res.status(500).json({
        message: "Failed to add/update measurement",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Register message routes first (with Object Storage implementation)
  app.use(messageRouter);

  // Register user role routes
  app.use(userRoleRouter);
  app.use(groupAdminRouter);
  app.use(inviteCodeRouter);

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
  router.get("/api/users", authenticate, async (req, res) => {
    try {
      // Debug logging for authorization
      console.log('GET /api/users - User authorization check:', {
        userId: req.user?.id,
        isAdmin: req.user?.isAdmin,
        isGroupAdmin: req.user?.isGroupAdmin,
        isTeamLead: req.user?.isTeamLead,
        teamId: req.user?.teamId
      });

      // Allow both full admins, group admins, and team leads
      if (!req.user?.isAdmin && !req.user?.isGroupAdmin && !req.user?.isTeamLead) {
        console.log('Access denied - not admin, group admin, or team lead');
        return res.status(403).json({ message: "Not authorized" });
      }

      let users = await storage.getAllUsers();

      // Filter users for group admins - only show users in their group's teams
      if (req.user.isGroupAdmin && !req.user.isAdmin && req.user.adminGroupId) {
        // Get teams in the admin's group
        const groupTeams = await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.groupId, req.user.adminGroupId));

        const teamIds = groupTeams.map(team => team.id);

        // Filter users to only those in the group's teams
        users = users.filter(user => user.teamId && teamIds.includes(user.teamId));
      }
      // Filter users for team leads - only show users in their team
      else if (req.user.isTeamLead && !req.user.isAdmin && !req.user.isGroupAdmin && req.user.teamId) {
        users = users.filter(user => user.teamId === req.user.teamId);
      }

      res.json(users);
    } catch (error) {
      logger.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

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

  // Get all notifications for current user
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

  // Get unread notification count
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
            inArray(notifications.id, notificationIds),
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

  // Mark a single notification as read
  router.post("/api/notifications/:notificationId/read", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const notificationId = parseInt(req.params.notificationId);
      if (isNaN(notificationId)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.userId, req.user.id),
            eq(notifications.id, notificationId),
          ),
        );

      res.json({ message: "Notification marked as read" });
    } catch (error) {
      logger.error("Error marking notification as read:", error);
      res.status(500).json({
        message: "Failed to mark notification as read",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Mark all notifications as read
  router.post("/api/notifications/read-all", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.userId, req.user.id));

      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      logger.error("Error marking all notifications as read:", error);
      res.status(500).json({
        message: "Failed to mark all notifications as read",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get messages with a specific user
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
        .orderBy(asc(messages.createdAt));

      res.json(userMessages);
    } catch (error) {
      logger.error("Error fetching messages:", error);
      res.status(500).json({
        message: "Failed to fetch messages",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get unread message count
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

      const { messageIds } = req.body;

      if (!Array.isArray(messageIds)) {
        return res.status(400).json({ message: "Invalid message IDs" });
      }

      await db
        .update(messages)
        .set({ isRead: true })
        .where(
          and(
            eq(messages.recipientId, req.user.id),
            inArray(messages.id, messageIds),
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

  // Delete all notifications for a user
  router.delete("/api/notifications", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Set content type before sending response
      res.setHeader("Content-Type", "application/json");

      // Delete all notifications for the user
      const result = await db
        .delete(notifications)
        .where(eq(notifications.userId, req.user.id))
        .returning();

      logger.info(`Deleted ${result.length} notifications for user ${req.user.id}`);

      res.json({
        message: "All notifications deleted successfully",
        count: result.length,
      });
    } catch (error) {
      logger.error(
        "Error deleting all notifications:",
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        message: "Failed to delete all notifications",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

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

      // Debug logging
      console.log("Current user:", JSON.stringify(currentUser, null, 2));
      console.log("Current team:", JSON.stringify(currentTeam, null, 2));

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

      // Get team average points - only from the same group as the user's team
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

      console.log("Filtering teams for group ID:", currentTeam.groupId);
      console.log("Team stats query result:", JSON.stringify(teamStats.rows, null, 2));

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
        }      }

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
        .update(users)
        .set({
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

        // Return content without converting Bible verses to links
        res.json({ content: result.value });
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

  // Update user role endpoint
  logger.info("[SERVER INIT] Registering PATCH /api/users/:userId/role endpoint");
  router.patch("/api/users/:userId/role", authenticate, async (req, res) => {
    try {
      logger.info(`[ROLE UPDATE] Endpoint hit - userId: ${req.params.userId}, requestUser: ${req.user?.id}, role: ${req.body.role}, value: ${req.body.value}`);

      if (!req.user) {
        logger.warn(`[ROLE UPDATE] No authenticated user`);
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        logger.warn(`[ROLE UPDATE] Invalid user ID: ${req.params.userId}`);
        return res.status(400).json({ message: "Invalid user ID format" });
      }

      const { role, value } = req.body;
      if (!role || typeof value !== 'boolean') {
        logger.warn(`[ROLE UPDATE] Invalid role or value: role=${role}, value=${value}`);
        return res.status(400).json({ message: "Invalid role or value" });
      }

      // Get the user being updated
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Authorization checks
      if (req.user.isAdmin) {
        // Admins can update any role
      } else if (req.user.isGroupAdmin) {
        // Group Admins can update roles for users in their group
        if (targetUser.teamId) {
          const [team] = await db
            .select()
            .from(teams)
            .where(eq(teams.id, targetUser.teamId))
            .limit(1);

          if (!team || team.groupId !== req.user.adminGroupId) {
            return res.status(403).json({ message: "Not authorized" });
          }
        }
      } else if (req.user.isTeamLead) {
        // Team Leads can only update isTeamLead role for users in their own team
        logger.info(`Team Lead authorization check: role=${role}, targetUserTeamId=${targetUser.teamId}, teamLeadTeamId=${req.user.teamId}`);
        if (role !== 'isTeamLead') {
          logger.warn(`Team Lead tried to update non-TeamLead role: ${role}`);
          return res.status(403).json({ message: "Team Leads can only update Team Lead role" });
        }
        if (targetUser.teamId !== req.user.teamId) {
          logger.warn(`Team Lead tried to update user in different team: targetTeam=${targetUser.teamId}, teamLeadTeam=${req.user.teamId}`);
          return res.status(403).json({ message: "You can only update users in your team" });
        }
      } else {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Update the role
      const [updatedUser] = await db
        .update(users)
        .set({ [role]: value })
        .where(eq(users.id, userId))
        .returning();

      logger.info(`User ${userId} role ${role} updated to ${value} by user ${req.user.id}`);
      res.status(200).json(updatedUser);
    } catch (error) {
      logger.error(`Error updating user role:`, error);
      res.status(500).json({
        message: "Failed to update user role",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update user endpoint
  router.patch("/api/users/:userId", authenticate, async (req, res) => {
    try {
      logger.info(`[GENERAL USER UPDATE] Endpoint hit - path: ${req.path}, userId: ${req.params.userId}`);

      if (!req.user?.isAdmin && !req.user?.isGroupAdmin && !req.user?.isTeamLead) {
        logger.warn(`[GENERAL USER UPDATE] Not authorized - user: ${req.user?.id}, isAdmin: ${req.user?.isAdmin}, isGroupAdmin: ${req.user?.isGroupAdmin}, isTeamLead: ${req.user?.isTeamLead}`);
        return res.status(403).json({ message: "Not authorized" });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID format" });
      }

      // For Team Leads, check that they're updating a user in their own team
      if (req.user?.isTeamLead && !req.user?.isAdmin && !req.user?.isGroupAdmin) {
        const [targetUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!targetUser) {
          return res.status(404).json({ message: "User not found" });
        }

        if (targetUser.teamId !== req.user.teamId) {
          return res.status(403).json({ message: "You can only update users in your team" });
        }
      }

      // Validate teamId if present
      if (req.body.teamId !== undefined && req.body.teamId !== null) {
        if (typeof req.body.teamId !== 'number') {
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

        // For Group Admins, verify the team is in their group
        if (req.user?.isGroupAdmin && !req.user?.isAdmin) {
          if (team.groupId !== req.user.adminGroupId) {
            return res.status(403).json({ message: "You can only assign users to teams in your group" });
          }
        }

        // Check if user is changing teams or not on any team
        const [currentUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        // Only skip capacity check if user is already on this specific team
        const needsCapacityCheck = !currentUser || currentUser.teamId !== req.body.teamId;

        if (needsCapacityCheck) {
          // Check if team has capacity
          const currentMemberCount = await storage.getTeamMemberCount(req.body.teamId);

          logger.info(`Team capacity check - Team ${req.body.teamId}: ${currentMemberCount}/${team.maxSize || 'unlimited'} members`);

          if (team.maxSize && currentMemberCount >= team.maxSize) {
            logger.warn(`Team ${req.body.teamId} is full, rejecting user assignment`);
            return res.status(400).json({ 
              message: `Cannot assign user to this team. Team is full (${currentMemberCount}/${team.maxSize} members).`
            });
          }
        }
      }

      // Prepare update data - only update teamJoinedAt and programStartDate if team is being changed
      const updateData: any = { ...req.body };

      // Convert programStartDate string to Date object if provided
      if (updateData.programStartDate && typeof updateData.programStartDate === 'string') {
        updateData.programStartDate = new Date(updateData.programStartDate);
      }

      // If team is being changed, update join date
      if (req.body.teamId !== undefined) {
        if (req.body.teamId) {
          const now = new Date();
          updateData.teamJoinedAt = now;
          // Only set programStartDate if explicitly provided in the request
          // Otherwise, leave it unchanged (don't auto-set to now)
        } else {
          // If removing from team, clear join date but keep program start date
          updateData.teamJoinedAt = null;
        }
      }

      // Update user
      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      logger.info(`User ${userId} updated successfully by admin ${req.user.id}`);
      res.status(200).json(updatedUser);
    } catch (error) {
      logger.error(`Error updating user ${req.params.userId}:`, error);
      res.status(500).json({
        message: "Failed to update user",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return httpServer;
};