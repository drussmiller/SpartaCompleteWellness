import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
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
  systemState,
} from "@shared/schema";
import { setupAuth, authenticate } from "./auth";
import express, { Request, Response, NextFunction } from "express";
import { Server as HttpServer } from "http";
import mammoth from "mammoth";
import bcrypt from "bcryptjs";
import sharp from "sharp";
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
import { emailVerificationRouter } from "./email-verification-routes";
import { stripeDonationRouter } from "./stripe-donation-routes";
import { spartaObjectStorage } from "./sparta-object-storage-final";
import { smsService } from "./sms-service";
import { uploadSessionManager } from "./upload-sessions";

// Configure multer for memory storage (Object Storage only)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for video uploads
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

  // Get autonomous mode setting
  router.get("/api/settings/autonomous-mode", authenticate, async (req, res) => {
    try {
      const result = await db
        .select()
        .from(systemState)
        .where(eq(systemState.key, "autonomous_mode"))
        .limit(1);
      
      const enabled = result.length > 0 && result[0].value === "true";
      res.json({ enabled });
    } catch (error) {
      console.error("Error fetching autonomous mode:", error);
      res.status(500).json({ message: "Failed to fetch autonomous mode setting" });
    }
  });

  // Set autonomous mode setting (admin only)
  router.post("/api/settings/autonomous-mode", authenticate, express.json(), async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { enabled } = req.body;
      
      const existing = await db
        .select()
        .from(systemState)
        .where(eq(systemState.key, "autonomous_mode"))
        .limit(1);
      
      if (existing.length > 0) {
        await db
          .update(systemState)
          .set({ value: enabled ? "true" : "false", updatedAt: new Date() })
          .where(eq(systemState.key, "autonomous_mode"));
      } else {
        await db.insert(systemState).values({
          key: "autonomous_mode",
          value: enabled ? "true" : "false",
        });
      }
      
      res.json({ success: true, enabled });
    } catch (error) {
      console.error("Error saving autonomous mode:", error);
      res.status(500).json({ message: "Failed to save autonomous mode setting" });
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

  // Feedback submission endpoint
  router.post("/api/feedback", authenticate, express.json(), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { subject, message } = req.body;

      if (!subject || !message) {
        return res.status(400).json({ message: "Subject and message are required" });
      }

      const userName = req.user.preferredName || req.user.username;
      const userEmail = req.user.email;
      const userPhone = req.user.phoneNumber;

      // Import email service
      const { sendFeedbackEmail } = await import("./email-service");

      // Send email to SpartaCompleteWellnessApp@gmail.com
      await sendFeedbackEmail(subject, message, userName, userEmail, userPhone);

      // Send SMS to all admins and create in-app notifications
      const adminUsers = await storage.getAdminUsers();
      const adminPhoneNumbers = adminUsers
        .filter(admin => admin.phoneNumber && admin.smsEnabled)
        .map(admin => admin.phoneNumber as string);

      if (adminPhoneNumbers.length > 0) {
        const smsMessage = `New feedback from ${userName}: ${subject}`;
        
        for (const phoneNumber of adminPhoneNumbers) {
          try {
            await smsService.sendSMSToUser(phoneNumber, smsMessage);
          } catch (smsError) {
            logger.error(`Failed to send SMS to admin ${phoneNumber}:`, smsError);
          }
        }
      }

      // Create in-app notifications for all admins
      for (const admin of adminUsers) {
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: admin.id,
            title: "New Feedback Received",
            message: `${userName} submitted feedback: ${subject}`,
            type: "feedback",
            isRead: false,
          })
          .returning();

        // Send real-time notification via WebSocket
        const adminSockets = clients.get(admin.id);
        if (adminSockets && adminSockets.size > 0) {
          adminSockets.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: "new_notification",
                  notification,
                })
              );
            }
          });
        }
      }

      logger.info(`Feedback submitted by user ${req.user.id}: ${subject}`);
      res.json({ message: "Feedback submitted successfully" });
    } catch (error) {
      logger.error("Error submitting feedback:", error);
      res.status(500).json({
        message: "Failed to submit feedback",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
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
          depth = 0,
          chunkedUploadMediaUrl = null,
          chunkedUploadThumbnailUrl = null,
          chunkedUploadFilename = null,
          chunkedUploadIsVideo = false;

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
          
          // Check for chunked upload data in FormData fields
          chunkedUploadMediaUrl = req.body.chunkedUploadMediaUrl || null;
          chunkedUploadThumbnailUrl = req.body.chunkedUploadThumbnailUrl || null;
          chunkedUploadFilename = req.body.chunkedUploadFilename || null;
          chunkedUploadIsVideo = req.body.chunkedUploadIsVideo === 'true' || req.body.is_video === 'true';
        } else {
          // Regular JSON request
          content = req.body.content;
          parentId = req.body.parentId;
          depth = req.body.depth || 0;
          
          // Check for chunked upload data
          chunkedUploadMediaUrl = req.body.chunkedUploadMediaUrl;
          chunkedUploadThumbnailUrl = req.body.chunkedUploadThumbnailUrl;
          chunkedUploadFilename = req.body.chunkedUploadFilename;
          chunkedUploadIsVideo = req.body.chunkedUploadIsVideo || false;
          
          console.log("📦 [Comment JSON] Chunked upload data:", {
            mediaUrl: chunkedUploadMediaUrl,
            thumbnailUrl: chunkedUploadThumbnailUrl,
            filename: chunkedUploadFilename,
            isVideo: chunkedUploadIsVideo
          });
        }

        logger.info("Creating comment with data:", {
          userId: req.user.id,
          parentId,
          contentLength: content ? content.length : 0,
          depth,
          hasFile: !!req.file,
          chunkedUploadMediaUrl,
          chunkedUploadThumbnailUrl,
          chunkedUploadIsVideo
        });

        // Validate: must have either content or media (file or chunked upload)
        const hasMedia = !!req.file || !!chunkedUploadMediaUrl;
        const hasContent = content && content.trim().length > 0;
        
        if (!hasContent && !hasMedia) {
          res.set("Content-Type", "application/json");
          return res.status(400).json({ message: "Comment must have either text content or media" });
        }
        
        if (!parentId) {
          res.set("Content-Type", "application/json");
          return res.status(400).json({ message: "Parent post ID is required" });
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
        let commentThumbnailUrl = null;
        let commentIsVideo = false;
        
        // Priority: chunked upload > regular file upload
        if (chunkedUploadMediaUrl) {
          commentMediaUrl = chunkedUploadMediaUrl;
          commentThumbnailUrl = chunkedUploadThumbnailUrl;
          commentIsVideo = chunkedUploadIsVideo;
          console.log(`Using chunked upload media URL for comment:`, { 
            url: commentMediaUrl, 
            thumbnailUrl: commentThumbnailUrl,
            isVideo: commentIsVideo 
          });
        } else if (req.file) {
          try {
            // Use SpartaObjectStorage for file handling
            const { spartaObjectStorage } = await import("./sparta-object-storage-final");

            // Determine if this is a video file
            const originalFilename = req.file.originalname.toLowerCase();
            const isVideoMimetype = req.file.mimetype.startsWith("video/");
            const isVideoExtension =
              originalFilename.endsWith(".mov") ||
              originalFilename.endsWith(".mp4") ||
              originalFilename.endsWith(".webm") ||
              originalFilename.endsWith(".avi") ||
              originalFilename.endsWith(".mkv");
            const hasVideoContentType = req.body.video_content_type?.startsWith('video/');

            // Combined video detection
            commentIsVideo = isVideoMimetype || hasVideoContentType || isVideoExtension;

            console.log(`Processing comment media file:`, {
              originalFilename: req.file.originalname,
              mimetype: req.file.mimetype,
              isVideo: commentIsVideo,
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
              commentIsVideo,
            );

            // Store just the storage key for the database, not the full URL
            commentMediaUrl = `shared/uploads/${fileInfo.filename}`;
            commentThumbnailUrl = fileInfo.thumbnailUrl || null;
            console.log(`Stored comment media file:`, { 
              url: commentMediaUrl, 
              thumbnailUrl: commentThumbnailUrl,
              isVideo: commentIsVideo 
            });
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
          thumbnailUrl: commentThumbnailUrl, // Add thumbnail URL for videos
          is_video: commentIsVideo // Add the is_video flag
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

      // Get the comment first to check ownership and media
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

      // Delete associated media files if they exist
      if (comment.mediaUrl) {
        try {
          // Handle HLS videos
          if (comment.mediaUrl.includes('/api/hls/')) {
            console.log(`[COMMENT HLS DELETE] Starting HLS deletion for mediaUrl: ${comment.mediaUrl}`);
            
            // Extract baseFilename from URL like "/api/hls/1764035901093-IMG_9504/playlist.m3u8"
            const match = comment.mediaUrl.match(/\/api\/hls\/([^\/]+)\//);
            console.log(`[COMMENT HLS DELETE] Regex match result: ${match ? match[1] : 'NO MATCH'}`);
            
            if (match && match[1]) {
              const baseFilename = match[1];
              
              // Delete all files in the HLS directory
              const hlsPrefix = `shared/uploads/hls/${baseFilename}/`;
              console.log(`[COMMENT HLS DELETE] Using prefix: ${hlsPrefix}`);
              
              try {
                // List all files with the HLS prefix
                console.log(`[COMMENT HLS DELETE] Listing files with prefix...`);
                const files = await spartaObjectStorage.listFiles(hlsPrefix);
                console.log(`[COMMENT HLS DELETE] Found ${files.length} files to delete`);
                
                // Delete all files in the HLS directory
                let deletedCount = 0;
                for (const fileKey of files) {
                  console.log(`[COMMENT HLS DELETE] Attempting to delete: ${fileKey}`);
                  try {
                    await spartaObjectStorage.deleteFile(fileKey);
                    deletedCount++;
                    console.log(`[COMMENT HLS DELETE] Successfully deleted: ${fileKey}`);
                  } catch (deleteError) {
                    console.error(`[COMMENT HLS DELETE] Error deleting ${fileKey}:`, deleteError);
                  }
                }
                
                console.log(`[COMMENT HLS DELETE] Deletion complete: ${deletedCount}/${files.length} files deleted`);
              } catch (hlsError) {
                console.error(`[COMMENT HLS DELETE] Error during HLS cleanup:`, hlsError);
                // Continue with comment deletion even if HLS cleanup fails
              }
            } else {
              console.log(`[COMMENT HLS DELETE] Could not extract baseFilename from URL: ${comment.mediaUrl}`);
            }
          }
          // Handle regular media files
          else {
            // Extract storage key from media URL
            let storageKey = null;
            
            // Format: /api/object-storage/direct-download?storageKey=shared/uploads/filename.ext
            const objectStorageMatch = comment.mediaUrl.match(/storageKey=([^&]+)/);
            if (objectStorageMatch && objectStorageMatch[1]) {
              storageKey = decodeURIComponent(objectStorageMatch[1]);
            }
            
            // Format: /api/serve-file?filename=shared/uploads/filename.ext
            const serveFileMatch = comment.mediaUrl.match(/filename=([^&]+)/);
            if (serveFileMatch && serveFileMatch[1]) {
              storageKey = decodeURIComponent(serveFileMatch[1]);
            }
            
            // Handle plain storage key paths (e.g., "shared/uploads/filename.ext")
            if (!storageKey && comment.mediaUrl.startsWith('shared/uploads/')) {
              storageKey = comment.mediaUrl;
            }
            
            if (storageKey) {
              console.log(`[COMMENT DELETE] Deleting media file: ${storageKey}`);
              try {
                await spartaObjectStorage.deleteFile(storageKey);
                console.log(`[COMMENT DELETE] Successfully deleted media file for comment ${commentId}`);
                
                // Also try to delete corresponding thumbnail for videos (.mov -> .jpg)
                if (storageKey.match(/\.(mov|mp4|webm|avi|mkv)$/i)) {
                  const thumbnailKey = storageKey.replace(/\.(mov|mp4|webm|avi|mkv)$/i, '.jpg');
                  console.log(`[COMMENT DELETE] Attempting to delete video thumbnail: ${thumbnailKey}`);
                  try {
                    await spartaObjectStorage.deleteFile(thumbnailKey);
                    console.log(`[COMMENT DELETE] Successfully deleted video thumbnail`);
                  } catch (thumbError) {
                    console.log(`[COMMENT DELETE] Video thumbnail not found or already deleted: ${thumbnailKey}`);
                  }
                }
              } catch (mediaError) {
                console.error(`[COMMENT DELETE] Error deleting media file:`, mediaError);
              }
            } else {
              console.log(`[COMMENT DELETE] Could not extract storage key from mediaUrl: ${comment.mediaUrl}`);
            }
          }
        } catch (error) {
          logger.error(`[COMMENT DELETE] Error cleaning up media files:`, error);
        }
      }

      // Delete associated thumbnail if it exists
      if (comment.thumbnailUrl) {
        try {
          let thumbnailStorageKey = null;
          
          const serveFileMatch = comment.thumbnailUrl.match(/filename=([^&]+)/);
          if (serveFileMatch && serveFileMatch[1]) {
            thumbnailStorageKey = decodeURIComponent(serveFileMatch[1]);
          }
          
          if (thumbnailStorageKey) {
            logger.info(`[COMMENT DELETE] Deleting thumbnail: ${thumbnailStorageKey}`);
            try {
              await spartaObjectStorage.deleteFile(thumbnailStorageKey);
              logger.info(`[COMMENT DELETE] Successfully deleted thumbnail for comment ${commentId}`);
            } catch (thumbError) {
              logger.error(`[COMMENT DELETE] Error deleting thumbnail:`, thumbError);
            }
          }
        } catch (error) {
          logger.error(`[COMMENT DELETE] Error cleaning up thumbnail:`, error);
        }
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
            avatarColor: users.avatarColor,
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
      const teamlessIntroOnly = req.query.teamlessIntroOnly === "true";
      const allUsers = req.query.allUsers === "true";
      const groupAllUsers = req.query.groupAllUsers === "true";
      const orgAllUsers = req.query.orgAllUsers === "true";

      // Organization Admin filter: show all posts from users in their organization
      if (orgAllUsers && req.user.isOrganizationAdmin && req.user.adminOrganizationId) {
        logger.info(`[ORG ALL USERS] Org Admin ${req.user.id} fetching all posts from organization ${req.user.adminOrganizationId}`);

        const orgGroups = await db
          .select({ id: groups.id })
          .from(groups)
          .where(eq(groups.organizationId, req.user.adminOrganizationId));
        const orgGroupIds = orgGroups.map(g => g.id);

        if (orgGroupIds.length === 0) {
          logger.info(`[ORG ALL USERS] No groups found in organization ${req.user.adminOrganizationId}`);
          return res.json([]);
        }

        const orgTeams = await db
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.groupId, orgGroupIds));
        const orgTeamIds = orgTeams.map(t => t.id);

        if (orgTeamIds.length === 0) {
          logger.info(`[ORG ALL USERS] No teams found in organization ${req.user.adminOrganizationId}`);
          return res.json([]);
        }

        const orgUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.teamId, orgTeamIds));
        const orgUserIds = orgUsers.map(u => u.id);

        if (orgUserIds.length === 0) {
          logger.info(`[ORG ALL USERS] No users found in organization ${req.user.adminOrganizationId}`);
          return res.json([]);
        }

        const orgPosts = await db
          .select({
            id: posts.id,
            content: posts.content,
            type: posts.type,
            mediaUrl: posts.mediaUrl,
            thumbnailUrl: posts.thumbnailUrl,
            is_video: posts.is_video,
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
              preferredName: users.preferredName,
              email: users.email,
              imageUrl: users.imageUrl,
              avatarColor: users.avatarColor,
              isAdmin: users.isAdmin,
              teamId: users.teamId,
            },
          })
          .from(posts)
          .leftJoin(users, eq(posts.userId, users.id))
          .where(
            and(
              isNull(posts.parentId),
              inArray(posts.userId, orgUserIds),
              excludeType ? sql`${posts.type} != ${excludeType}` : undefined
            )
          )
          .orderBy(desc(posts.createdAt))
          .limit(limit)
          .offset(offset);

        logger.info(`[ORG ALL USERS] Returning ${orgPosts.length} posts from ${orgUserIds.length} users in organization ${req.user.adminOrganizationId}`);
        return res.json(orgPosts);
      }

      // Group Admin filter: show all posts from users in their group
      if (groupAllUsers && req.user.isGroupAdmin && req.user.adminGroupId) {
        logger.info(`[GROUP ALL USERS] Group Admin ${req.user.id} fetching all posts from group ${req.user.adminGroupId}`);

        // Find all teams in the group admin's group
        const groupTeams = await db
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.groupId, req.user.adminGroupId));

        const teamIds = groupTeams.map(t => t.id);

        // Find all users in those teams
        const groupUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.teamId, teamIds));

        const userIds = groupUsers.map(u => u.id);

        if (userIds.length === 0) {
          logger.info(`[GROUP ALL USERS] No users found in group ${req.user.adminGroupId}`);
          return res.json([]);
        }

        // Fetch all posts from users in the group (excluding prayer posts)
        const groupPosts = await db
          .select({
            id: posts.id,
            content: posts.content,
            type: posts.type,
            mediaUrl: posts.mediaUrl,
            thumbnailUrl: posts.thumbnailUrl,
            is_video: posts.is_video,
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
              preferredName: users.preferredName,
              email: users.email,
              imageUrl: users.imageUrl,
              avatarColor: users.avatarColor,
              isAdmin: users.isAdmin,
              teamId: users.teamId,
            },
          })
          .from(posts)
          .leftJoin(users, eq(posts.userId, users.id))
          .where(
            and(
              isNull(posts.parentId),
              inArray(posts.userId, userIds),
              excludeType ? sql`${posts.type} != ${excludeType}` : undefined
            )
          )
          .orderBy(desc(posts.createdAt))
          .limit(limit)
          .offset(offset);

        logger.info(`[GROUP ALL USERS] Returning ${groupPosts.length} posts from ${userIds.length} users in group ${req.user.adminGroupId}`);
        return res.json(groupPosts);
      }

      // Admin filter: show all posts from all users (when allUsers is true)
      if (allUsers && req.user.isAdmin) {
        logger.info(`[ALL USERS] Admin ${req.user.id} fetching all posts from all users`);

        // Fetch all posts from all users (excluding prayer posts if specified)
        const allPosts = await db
          .select({
            id: posts.id,
            content: posts.content,
            type: posts.type,
            mediaUrl: posts.mediaUrl,
            thumbnailUrl: posts.thumbnailUrl,
            is_video: posts.is_video,
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
              preferredName: users.preferredName,
              email: users.email,
              imageUrl: users.imageUrl,
              avatarColor: users.avatarColor,
              isAdmin: users.isAdmin,
              teamId: users.teamId,
            },
          })
          .from(posts)
          .leftJoin(users, eq(posts.userId, users.id))
          .where(
            and(
              isNull(posts.parentId),
              excludeType ? sql`${posts.type} != ${excludeType}` : undefined
            )
          )
          .orderBy(desc(posts.createdAt))
          .limit(limit)
          .offset(offset);

        logger.info(`[ALL USERS] Returning ${allPosts.length} posts from all users`);
        return res.json(allPosts);
      }

      // Admin/Group Admin/Org Admin/Team Lead filter: show only introductory videos from team-less users
      if (teamlessIntroOnly && (req.user.isAdmin || req.user.isGroupAdmin || req.user.isOrganizationAdmin || req.user.isTeamLead)) {
        logger.info(`[TEAMLESS INTRO FILTER] ${req.user.id} fetching intro videos from team-less users`);

        // Scope team-less users by organization for org admins
        // Super admins see all, org admins see only users pending for their organization
        let teamlessConditions: any[] = [isNull(users.teamId)];

        if (req.user.isOrganizationAdmin && req.user.adminOrganizationId && !req.user.isAdmin) {
          teamlessConditions.push(eq(users.pendingOrganizationId, req.user.adminOrganizationId));
          logger.info(`[TEAMLESS INTRO FILTER] Scoping to org ${req.user.adminOrganizationId} for org admin ${req.user.id}`);
        } else if (req.user.isGroupAdmin && !req.user.isAdmin) {
          // Group admins: find their org from their group, then filter by pendingOrganizationId
          const [adminGroup] = await db.select().from(groups).where(eq(groups.id, req.user.adminGroupId!)).limit(1);
          if (adminGroup) {
            teamlessConditions.push(eq(users.pendingOrganizationId, adminGroup.organizationId));
            logger.info(`[TEAMLESS INTRO FILTER] Scoping to org ${adminGroup.organizationId} for group admin ${req.user.id}`);
          }
        } else if (req.user.isTeamLead && req.user.teamId && !req.user.isAdmin) {
          // Team leads: find their org from team -> group -> org
          const [leadTeam] = await db.select().from(teams).where(eq(teams.id, req.user.teamId)).limit(1);
          if (leadTeam) {
            const [leadGroup] = await db.select().from(groups).where(eq(groups.id, leadTeam.groupId)).limit(1);
            if (leadGroup) {
              teamlessConditions.push(eq(users.pendingOrganizationId, leadGroup.organizationId));
              logger.info(`[TEAMLESS INTRO FILTER] Scoping to org ${leadGroup.organizationId} for team lead ${req.user.id}`);
            }
          }
        }

        const teamlessUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(and(...teamlessConditions));

        const teamlessUserIds = teamlessUsers.map(u => u.id);

        if (teamlessUserIds.length === 0) {
          logger.info(`[TEAMLESS INTRO FILTER] No team-less users found in scope`);
          return res.json([]);
        }

        // Build query for all posts from team-less users
        const teamlessPosts = await db
          .select({
            id: posts.id,
            content: posts.content,
            type: posts.type,
            mediaUrl: posts.mediaUrl,
            thumbnailUrl: posts.thumbnailUrl,
            is_video: posts.is_video,
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
              preferredName: users.preferredName,
              email: users.email,
              imageUrl: users.imageUrl,
              avatarColor: users.avatarColor,
              isAdmin: users.isAdmin,
              teamId: users.teamId,
            },
          })
          .from(posts)
          .leftJoin(users, eq(posts.userId, users.id))
          .where(
            and(
              isNull(posts.parentId),
              inArray(posts.userId, teamlessUserIds)
            )
          )
          .orderBy(desc(posts.createdAt))
          .limit(limit)
          .offset(offset);

        logger.info(`[TEAMLESS FILTER] Returning ${teamlessPosts.length} posts from ${teamlessUserIds.length} team-less users`);
        return res.json(teamlessPosts);
      }

      // Build the query conditions
      let conditions = [isNull(posts.parentId)]; // Start with only top-level posts

      // Add team-only filter if specified
      // This includes posts from team members AND posts targeted to this team via scope
      if (teamOnly) {
        if (!req.user.teamId && req.user.isAdmin) {
          // Admin users with no team can see all posts from all team members
          logger.info(`Admin user ${req.user.id} has no team, showing all posts from all users`);
          // No additional filter needed - they see all posts
        } else if (!req.user.teamId) {
          // If user has no team (and is not Admin), show only their own introductory_video posts
          logger.info(`User ${req.user.id} has no team, showing only their introductory_video posts`);
          conditions.push(
            and(
              eq(posts.userId, req.user.id),
              eq(posts.type, 'introductory_video')
            )
          );
        } else {
          // Get all users in the same team
          const teamMemberIds = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.teamId, req.user.teamId));

          const memberIds = teamMemberIds.map(member => member.id);

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
      } else if (req.user.isAdmin) {
        // Admin with no team - can see ALL posts regardless of scope
        logger.info(`[SCOPE FILTER] Admin user ${req.user.id} has no team - showing all posts`);
        // No additional scope filter for admins without team
      } else {
        // User has no team - show 'everyone' posts OR their own posts (e.g., introductory videos)
        conditions.push(
          or(
            eq(posts.postScope, 'everyone'),
            eq(posts.userId, req.user.id)
          )
        );
        logger.info(`[SCOPE FILTER] User ${req.user.id} has no team - showing 'everyone' posts and own posts`);
      }

      // Filter introductory videos for non-admin users
      // Non-admins can only see:
      // - Their own introductory videos (any scope)
      // - Introductory videos with scope='my_team' (handled by existing scope logic)
      // They CANNOT see other users' introductory videos with scope='everyone' (team-less users)
      if (!req.user.isAdmin) {
        conditions.push(
          or(
            ne(posts.type, 'introductory_video'),
            eq(posts.userId, req.user.id),
            ne(posts.postScope, 'everyone')
          )
        );
        logger.info(`[INTRODUCTORY VIDEO FILTER] Non-admin user ${req.user.id} - filtering out other users' team-less introductory videos`);
      }

      // Join with users table to get author info
      const query = db
        .select({
          id: posts.id,
          content: posts.content,
          type: posts.type,
          mediaUrl: posts.mediaUrl,
          thumbnailUrl: posts.thumbnailUrl,
          is_video: posts.is_video,
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
            preferredName: users.preferredName,
            email: users.email,
            imageUrl: users.imageUrl,
            avatarColor: users.avatarColor,
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
      
      // DEBUG: Log ALL posts data to verify thumbnailUrl is being returned
      logger.info(`[DEBUG] Returning ${result.length} posts. First post keys:`, result.length > 0 ? Object.keys(result[0]) : 'no posts');
      const post824 = result.find((p: any) => p.id === 824);
      if (post824) {
        logger.info(`[DEBUG] Found post 824: mediaUrl=${post824.mediaUrl}, thumbnailUrl=${post824.thumbnailUrl}`);
      } else {
        logger.info(`[DEBUG] Post 824 NOT found in query results!`);
      }
      
      res.json(result);
    } catch (error) {
      logger.error("Error fetching posts:", error);
      res.status(500).json({
        message: "Failed to fetch posts",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Chunked upload endpoints for large files (to bypass 413 proxy limit)
  
  // Initialize a chunked upload session
  router.post("/api/uploads/sessions", authenticate, express.json(), async (req, res) => {
    try {
      const { filename, mimeType, totalSize, chunkSize } = req.body;
      
      if (!filename || !mimeType || !totalSize) {
        return res.status(400).json({ message: "Missing required fields: filename, mimeType, totalSize" });
      }
      
      const session = uploadSessionManager.createSession(
        req.user.id,
        filename,
        mimeType,
        totalSize,
        chunkSize
      );
      
      res.json({
        sessionId: session.id,
        chunkSize: session.chunkSize,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      logger.error("Error creating upload session:", error);
      res.status(500).json({ message: "Failed to create upload session" });
    }
  });
  
  // Upload a chunk
  router.patch("/api/uploads/sessions/:sessionId/chunk", authenticate, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const chunkIndex = parseInt(req.query.chunkIndex as string);
      
      if (isNaN(chunkIndex)) {
        return res.status(400).json({ message: "Invalid chunk index" });
      }
      
      const session = uploadSessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found or expired" });
      }
      
      if (session.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      // Read raw chunk data from request body
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const chunkData = Buffer.concat(chunks);
          uploadSessionManager.appendChunk(sessionId, chunkIndex, chunkData);
          
          const progress = uploadSessionManager.getSessionProgress(sessionId);
          res.json({
            success: true,
            progress: progress?.progress || 0,
            uploadedBytes: progress?.uploadedBytes || 0,
            totalSize: progress?.totalSize || 0,
          });
        } catch (error) {
          logger.error("Error appending chunk:", error);
          res.status(500).json({ message: error instanceof Error ? error.message : "Failed to append chunk" });
        }
      });
    } catch (error) {
      logger.error("Error uploading chunk:", error);
      res.status(500).json({ message: "Failed to upload chunk" });
    }
  });
  
  // Finalize upload and get the file buffer
  router.post("/api/uploads/sessions/:sessionId/finalize", authenticate, express.json(), async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { postType } = req.body;
      
      console.log(`📤 [Finalize Upload] Starting for session ${sessionId}, postType: ${postType}`);
      
      const session = uploadSessionManager.getSession(sessionId);
      if (!session) {
        console.error(`❌ [Finalize Upload] Session not found: ${sessionId}`);
        return res.status(404).json({ message: "Session not found or expired" });
      }
      
      if (session.userId !== req.user.id) {
        console.error(`❌ [Finalize Upload] Unauthorized access to session ${sessionId}`);
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      console.log(`📤 [Finalize Upload] Session found, finalizing ${session.totalSize} bytes...`);
      
      // Finalize and get complete file
      const fileBuffer = uploadSessionManager.finalizeSession(sessionId);
      
      console.log(`✅ [Finalize Upload] File buffer ready: ${fileBuffer.length} bytes`);
      
      // Determine if this is a video
      const isVideo = session.mimeType.startsWith('video/');
      
      console.log(`📤 [Finalize Upload] Storing file in Object Storage, isVideo: ${isVideo}`);
      
      // Store file using SpartaObjectStorageFinal (includes MOV->MP4 conversion)
      const fileInfo = await spartaObjectStorage.storeFile(
        fileBuffer,
        session.filename,
        session.mimeType,
        isVideo
      );
      
      console.log(`✅ [Finalize Upload] File stored successfully:`, {
        mediaUrl: fileInfo.url,
        thumbnailUrl: fileInfo.thumbnailUrl,
        filename: fileInfo.filename,
        isVideo
      });
      
      // Clean up session
      uploadSessionManager.deleteSession(sessionId);
      
      // Return file info for use in post creation
      res.json({
        success: true,
        mediaUrl: fileInfo.url,
        thumbnailUrl: fileInfo.thumbnailUrl,
        filename: fileInfo.filename,
        isVideo,
      });
    } catch (error) {
      console.error("❌ [Finalize Upload] Error:", error);
      logger.error("Error finalizing upload:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to finalize upload" 
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
      
      // Introductory video posts require a video upload - no text-only allowed
      if (postData.type === 'introductory_video' && !uploadedFile && !postData.mediaUrl && !postData.chunkedUploadMediaUrl) {
        logger.info("Rejecting intro video post without media");
        return res.status(400).json({ message: "Intro video posts require a video upload" });
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
        let commentThumbnailUrl = null;
        let commentIsVideo = false;
        
        // Check if chunked upload was used (for large videos with HLS conversion)
        // Note: For comments, the data comes directly in req.body from FormData, not in postData
        if (req.body.chunkedUploadMediaUrl) {
          console.log("✅ Using chunked upload result for comment:", {
            mediaUrl: req.body.chunkedUploadMediaUrl,
            thumbnailUrl: req.body.chunkedUploadThumbnailUrl,
            isVideo: req.body.chunkedUploadIsVideo
          });
          commentMediaUrl = req.body.chunkedUploadMediaUrl;
          commentThumbnailUrl = req.body.chunkedUploadThumbnailUrl || null;
          commentIsVideo = req.body.chunkedUploadIsVideo === 'true' || req.body.chunkedUploadIsVideo === true;
        }
        // Check if we have a file upload with the comment (for small files)
        else if (uploadedFile && uploadedFile.buffer) {
          try {
            // Use SpartaObjectStorage for file handling
            const { spartaObjectStorage } = await import('./sparta-object-storage-final');

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
            commentIsVideo = isVideoMimetype || hasVideoContentType || isVideoExtension;


            console.log("Processing comment media file:", {
              originalFilename: uploadedFile.originalname,
              mimetype: uploadedFile.mimetype,
              isVideo: commentIsVideo,
              fileSize: uploadedFile.size
            });

            logger.info(`Processing comment media file: ${uploadedFile.originalname}, type: ${uploadedFile.mimetype}, isVideo: ${commentIsVideo}, size: ${uploadedFile.size}`);

            const fileInfo = await spartaObjectStorage.storeFile(
              uploadedFile.buffer,
              uploadedFile.originalname,
              uploadedFile.mimetype,
              commentIsVideo,
            );

            commentMediaUrl = fileInfo.url;
            console.log(`Stored comment media file:`, { url: commentMediaUrl, isVideo: commentIsVideo });
          } catch (error) {
            logger.error("Error processing comment media file:", error);
            // Continue with comment creation even if media processing fails
          }
        }

        console.log(`Creating comment with is_video: ${commentIsVideo}`, {
          userId: req.user.id,
          mediaUrl: commentMediaUrl,
          thumbnailUrl: commentThumbnailUrl,
          is_video: commentIsVideo,
          parentId: postData.parentId
        });

        const post = await storage.createComment({
          userId: req.user.id,
          content: postData.content ? postData.content.trim() : '',
          parentId: postData.parentId,
          depth: postData.depth || 0,
          points: commentPoints, // Always set to 0 points for comments
          mediaUrl: commentMediaUrl, // Add the media URL if a file was uploaded
          thumbnailUrl: commentThumbnailUrl, // Add thumbnail URL for videos
          is_video: commentIsVideo // Add the is_video flag
        });
        
        console.log(`Comment created with ID ${post.id}, is_video: ${post.is_video}`);
        return res.status(201).json(post);
      }

      // Handle regular post creation
      let mediaUrl = null;
      let posterUrl = null;
      let mediaProcessed = false;
      
      // Check if we used chunked upload (for large files)
      if (postData.chunkedUploadMediaUrl) {
        console.log("✅ Using chunked upload result for post creation:", {
          mediaUrl: postData.chunkedUploadMediaUrl,
          thumbnailUrl: postData.chunkedUploadThumbnailUrl,
          filename: postData.chunkedUploadFilename,
          isVideo: postData.chunkedUploadIsVideo
        });
        mediaUrl = postData.chunkedUploadMediaUrl;
        posterUrl = postData.chunkedUploadThumbnailUrl;
        isVideo = postData.chunkedUploadIsVideo || false;
        mediaProcessed = true;
      }
      // Check if we're using an existing memory verse video
      else if (postData.type === 'memory_verse' && req.body.existing_video_id) {
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
          const { spartaObjectStorage } = await import('./sparta-object-storage-final');

          // With memory storage, we work directly with the buffer
          logger.info(`Processing file from memory buffer: ${uploadedFile.originalname}, size: ${uploadedFile.buffer.length} bytes`);

          // Proceed with buffer-based processing
            // Handle video files differently - check both mimetype and file extension
            const originalFilename = uploadedFile.originalname.toLowerCase();

            // Simplified detection for memory verse posts - rely only on the post type
            const isMemoryVersePost = postData.type === 'memory_verse';
            const isIntroductoryVideoPost = postData.type === 'introductory_video';

            // Handle specialized types
            const isMiscellaneousPost = postData.type === 'miscellaneous';
            const isPrayerPost = postData.type === 'prayer';

            console.log("Post type detection:", {
              isMemoryVersePost,
              isIntroductoryVideoPost,
              isMiscellaneousPost,
              isPrayerPost,
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

            // For miscellaneous and prayer posts, check if explicitly marked as video from client
            const isMiscellaneousVideo = (isMiscellaneousPost || isPrayerPost) && 
                                       (req.body.is_video === "true" || 
                                        req.body.selected_media_type === "video" ||
                                        (uploadedFile && (isVideoMimetype || isVideoExtension)));

            // Combined video detection
            // - memory_verse and introductory_video are always videos
            // - miscellaneous/prayer posts only if explicitly marked
            // - other posts based on mimetype/extension
            isVideo = isMemoryVersePost || 
                          isIntroductoryVideoPost ||
                          ((isMiscellaneousPost || isPrayerPost) ? isMiscellaneousVideo : 
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

            const fileInfo = await spartaObjectStorage.storeFile(
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

      // Enforce scope for introductory videos
      let postScope = postData.postScope || 'my_team';
      if (postData.type === 'introductory_video') {
        // Team-less users: scope is 'everyone' (visible only to admins + self due to GET filter)
        // Users with team: scope is 'my_team' (visible to team)
        postScope = req.user.teamId ? 'my_team' : 'everyone';
        logger.info(`[INTRODUCTORY VIDEO SCOPE] Setting scope to '${postScope}' for user ${req.user.id} (teamId: ${req.user.teamId})`);
      }

      const post = await db
        .insert(posts)
        .values({
          userId: req.user.id,
          type: postData.type,
          content: postData.content?.trim() || '',
          mediaUrl: mediaUrl,
          thumbnailUrl: posterUrl || null, // Save thumbnail URL for videos
          is_video: isVideo || false, // Set is_video flag based on our detection logic
          points: points,
          postScope: postScope,
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
          thumbnailUrl: posts.thumbnailUrl,
          is_video: posts.is_video,
          createdAt: posts.createdAt,
          parentId: posts.parentId,
          points: posts.points,
          userId: posts.userId,
          author: {
            id: users.id,
            username: users.username,
            preferredName: users.preferredName,
            email: users.email,
            imageUrl: users.imageUrl,
            avatarColor: users.avatarColor,
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
      console.log(`\n========== DELETE POST REQUEST ==========`);
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
      console.log(`[DELETE] Post ID: ${postId}`);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      // Check if user owns the post or is admin
      const [post] = await db
        .select({
          id: posts.id,
          userId: posts.userId,
          mediaUrl: posts.mediaUrl,
          thumbnailUrl: posts.thumbnailUrl,
          type: posts.type,
        })
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);

      console.log(`[DELETE] Post data:`, JSON.stringify(post, null, 2));

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (post.userId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }
      
      // Prevent users from deleting their intro video post (admins can still delete)
      if (post.type === 'introductory_video' && !req.user.isAdmin) {
        return res.status(403).json({ message: "You cannot delete your intro video post" });
      }

      // Delete associated media files
      console.log(`[DELETE] Checking media URL: ${post.mediaUrl}`);
      if (post.mediaUrl) {
        try {
          // Handle HLS videos
          if (post.mediaUrl.includes('/api/hls/')) {
            console.log(`[HLS DELETE] Starting HLS deletion for mediaUrl: ${post.mediaUrl}`);
            
            // Extract baseFilename from URL like "/api/hls/1764035901093-IMG_9504/playlist.m3u8"
            const match = post.mediaUrl.match(/\/api\/hls\/([^\/]+)\//);
            console.log(`[HLS DELETE] Regex match result: ${match ? match[1] : 'NO MATCH'}`);
            
            if (match && match[1]) {
              const baseFilename = match[1];
              
              // Delete all files in the HLS directory
              const hlsPrefix = `shared/uploads/hls/${baseFilename}/`;
              console.log(`[HLS DELETE] Using prefix: ${hlsPrefix}`);
              
              try {
                // List all files with the HLS prefix
                console.log(`[HLS DELETE] Listing files with prefix...`);
                const files = await spartaObjectStorage.listFiles(hlsPrefix);
                console.log(`[HLS DELETE] Found ${files.length} files to delete`);
                
                // Delete all files in the HLS directory
                let deletedCount = 0;
                for (const fileKey of files) {
                  console.log(`[HLS DELETE] Attempting to delete: ${fileKey}`);
                  try {
                    await spartaObjectStorage.deleteFile(fileKey);
                    deletedCount++;
                    console.log(`[HLS DELETE] Successfully deleted: ${fileKey}`);
                  } catch (deleteError) {
                    console.error(`[HLS DELETE] Error deleting ${fileKey}:`, deleteError);
                  }
                }
                
                console.log(`[HLS DELETE] Deletion complete: ${deletedCount}/${files.length} files deleted`);
              } catch (hlsError) {
                console.error(`[HLS DELETE] Error during HLS cleanup:`, hlsError);
                // Continue with post deletion even if HLS cleanup fails
              }
            } else {
              console.log(`[HLS DELETE] Could not extract baseFilename from URL: ${post.mediaUrl}`);
            }
          } 
          // Handle regular media files (images and non-HLS videos)
          else {
            // Extract the storage key from the URL
            let storageKey = null;
            
            // Format: /api/object-storage/direct-download?storageKey=shared/uploads/filename.ext
            const objectStorageMatch = post.mediaUrl.match(/storageKey=([^&]+)/);
            if (objectStorageMatch && objectStorageMatch[1]) {
              storageKey = decodeURIComponent(objectStorageMatch[1]);
            }
            
            // Format: /api/serve-file?filename=shared/uploads/filename.ext
            const serveFileMatch = post.mediaUrl.match(/filename=([^&]+)/);
            if (serveFileMatch && serveFileMatch[1]) {
              storageKey = decodeURIComponent(serveFileMatch[1]);
            }
            
            // Handle plain storage key paths (e.g., "shared/uploads/filename.ext")
            if (!storageKey && post.mediaUrl.startsWith('shared/uploads/')) {
              storageKey = post.mediaUrl;
            }
            
            if (storageKey) {
              console.log(`[POST DELETE] Deleting media file: ${storageKey}`);
              try {
                await spartaObjectStorage.deleteFile(storageKey);
                console.log(`[POST DELETE] Successfully deleted media file for post ${postId}`);
                
                // Also try to delete corresponding thumbnail for videos (.mov -> .jpg)
                if (storageKey.match(/\.(mov|mp4|webm|avi|mkv)$/i)) {
                  const thumbnailKey = storageKey.replace(/\.(mov|mp4|webm|avi|mkv)$/i, '.jpg');
                  console.log(`[POST DELETE] Attempting to delete video thumbnail: ${thumbnailKey}`);
                  try {
                    await spartaObjectStorage.deleteFile(thumbnailKey);
                    console.log(`[POST DELETE] Successfully deleted video thumbnail`);
                  } catch (thumbError) {
                    console.log(`[POST DELETE] Video thumbnail not found or already deleted: ${thumbnailKey}`);
                  }
                }
              } catch (mediaError) {
                console.error(`[POST DELETE] Error deleting media file:`, mediaError);
                // Continue with post deletion even if media cleanup fails
              }
            } else {
              console.log(`[POST DELETE] Could not extract storage key from mediaUrl: ${post.mediaUrl}`);
            }
          }
        } catch (error) {
          logger.error(`[POST DELETE] Error cleaning up media files:`, error);
          // Continue with post deletion even if media cleanup fails
        }
      }

      // Delete associated thumbnail if it exists
      if (post.thumbnailUrl) {
        try {
          // Extract the storage path from the thumbnail URL
          let thumbnailStorageKey = null;
          
          // Format: /api/thumbnails/shared/uploads/thumbnails/filename.jpg
          const thumbnailMatch = post.thumbnailUrl.match(/\/api\/thumbnails\/(.+)/);
          if (thumbnailMatch && thumbnailMatch[1]) {
            thumbnailStorageKey = thumbnailMatch[1];
          }
          
          // Format: /api/serve-file?filename=shared/uploads/filename.jpg
          const serveFileMatch = post.thumbnailUrl.match(/filename=([^&]+)/);
          if (serveFileMatch && serveFileMatch[1]) {
            thumbnailStorageKey = decodeURIComponent(serveFileMatch[1]);
          }
          
          if (thumbnailStorageKey) {
            logger.info(`[POST DELETE] Deleting thumbnail: ${thumbnailStorageKey}`);
            
            try {
              await spartaObjectStorage.deleteFile(thumbnailStorageKey);
              logger.info(`[POST DELETE] Successfully deleted thumbnail for post ${postId}`);
            } catch (thumbError) {
              logger.error(`[POST DELETE] Error deleting thumbnail:`, thumbError);
              // Continue with post deletion even if thumbnail cleanup fails
            }
          }
        } catch (error) {
          logger.error(`[POST DELETE] Error cleaning up thumbnail:`, error);
          // Continue with post deletion even if thumbnail cleanup fails
        }
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
        return res.status(404).json({ message: "Division not found" });
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

      const existingTeams = await db.select().from(teams).where(eq(teams.groupId, parsedData.data.groupId));
      if (existingTeams.some(t => t.name.trim().toLowerCase() === parsedData.data.name.trim().toLowerCase())) {
        return res.status(400).json({ message: "A team with this name already exists in this division" });
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
          const postsWithMedia = userPosts.filter(p => p.mediaUrl);
          
          // Delete media files with proper HLS and thumbnail handling
          for (const post of postsWithMedia) {
            const mediaUrl = post.mediaUrl as string;
            try {
              if (mediaUrl.includes('/api/hls/')) {
                const hlsMatch = mediaUrl.match(/\/api\/hls\/([^/]+)\//);
                if (hlsMatch) {
                  const baseFilename = hlsMatch[1];
                  const hlsPrefix = `shared/uploads/hls/${baseFilename}/`;
                  try {
                    const files = await spartaObjectStorage.listFiles(hlsPrefix);
                    for (const fileKey of files) {
                      try { await spartaObjectStorage.deleteFile(fileKey); } catch (err) {}
                    }
                  } catch (err) {}
                  try { await spartaObjectStorage.deleteFile(`shared/uploads/${baseFilename}-hls-source.jpg`); } catch (err) {}
                }
              } else {
                await spartaObjectStorage.deleteFile(mediaUrl);
                if (post.is_video) {
                  let filename = '';
                  if (mediaUrl.includes('shared/uploads/')) {
                    filename = mediaUrl.split('shared/uploads/')[1]?.split('?')[0] || '';
                  } else if (mediaUrl.includes('/api/serve-file')) {
                    const match = mediaUrl.match(/filename=([^&]+)/);
                    filename = match ? match[1] : '';
                  } else {
                    filename = mediaUrl.split('/').pop()?.split('?')[0] || '';
                  }
                  if (filename) {
                    let baseFilename = filename.replace(/\.(mp4|mov|avi|mkv|webm|mpg|mpeg)$/i, '').replace(/^shared\/uploads\//, '');
                    const thumbnailVariations = [
                      `shared/uploads/${baseFilename}.poster.jpg`,
                      `shared/uploads/${baseFilename}.jpg`,
                      `shared/uploads/${baseFilename}.jpeg`,
                      `shared/uploads/thumb-${baseFilename}.jpg`,
                    ];
                    for (const thumbnailKey of thumbnailVariations) {
                      try { await spartaObjectStorage.deleteFile(thumbnailKey); } catch (err) {}
                    }
                  }
                }
              }
            } catch (err) {
              logger.error(`Failed to delete media file ${mediaUrl}:`, err);
            }
          }
          logger.info(`Deleted media files for team ${teamId}`);

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
              await spartaObjectStorage.deleteFile(mediaUrl);
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

  router.patch("/api/teams/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const teamId = parseInt(req.params.id);
      if (isNaN(teamId)) {
        return res.status(400).json({ message: "Invalid team ID" });
      }

      const { name, description, groupId, maxSize, status, programStartDate, currentWeek, currentDay } = req.body;
      const updateData: any = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          return res.status(400).json({ message: "Team name must be a non-empty string" });
        }
        updateData.name = name.trim();
      }

      if (description !== undefined) updateData.description = description;

      if (groupId !== undefined) {
        updateData.groupId = typeof groupId === 'string' ? parseInt(groupId) : groupId;
      }

      if (maxSize !== undefined) {
        const parsedMaxSize = typeof maxSize === 'string' ? parseInt(maxSize) : maxSize;
        if (isNaN(parsedMaxSize) || parsedMaxSize < 1) {
          return res.status(400).json({ message: "Max size must be a positive number" });
        }
        updateData.maxSize = parsedMaxSize;
      }

      if (status !== undefined) {
        updateData.status = typeof status === 'string' ? parseInt(status) : status;
      }

      if (programStartDate !== undefined) {
        if (programStartDate === null || programStartDate === '') {
          updateData.programStartDate = null;
        } else {
          updateData.programStartDate = new Date(programStartDate);
        }
      }

      if (currentWeek !== undefined) updateData.currentWeek = currentWeek;
      if (currentDay !== undefined) updateData.currentDay = currentDay;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      if (updateData.name || updateData.groupId) {
        const [currentTeam] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
        if (currentTeam) {
          const targetGroupId = updateData.groupId || currentTeam.groupId;
          const checkName = (updateData.name || currentTeam.name).trim().toLowerCase();
          const existingTeams = await db.select().from(teams).where(
            and(eq(teams.groupId, targetGroupId), ne(teams.id, teamId))
          );
          if (existingTeams.some(t => t.name.trim().toLowerCase() === checkName)) {
            return res.status(400).json({ message: "A team with this name already exists in this division" });
          }
        }
      }

      let usersUpdated = 0;

      if (updateData.status === 0) {
        const teamUsers = await db.select().from(users).where(
          and(eq(users.teamId, teamId), eq(users.status, 1))
        );
        if (teamUsers.length > 0) {
          await db.update(users)
            .set({ status: 0 })
            .where(and(eq(users.teamId, teamId), eq(users.status, 1)));
          usersUpdated = teamUsers.length;
          logger.info(`Set ${usersUpdated} users to inactive when team ${teamId} was set to inactive`);
        }
      }

      const updatedTeam = await storage.updateTeam(teamId, updateData);

      res.json({ ...updatedTeam, usersUpdated });
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
              const postsWithMedia = userPosts.filter(p => p.mediaUrl);
              
              // Delete media files from Object Storage with proper HLS and thumbnail handling
              for (const post of postsWithMedia) {
                const mediaUrl = post.mediaUrl as string;
                try {
                  // Check if this is an HLS video
                  if (mediaUrl.includes('/api/hls/')) {
                    // Extract base filename from HLS URL: /api/hls/{baseFilename}/playlist.m3u8
                    const hlsMatch = mediaUrl.match(/\/api\/hls\/([^/]+)\//);
                    if (hlsMatch) {
                      const baseFilename = hlsMatch[1];
                      logger.info(`Deleting HLS video for org deletion: ${baseFilename}`);
                      
                      // Delete all files in the HLS directory
                      const hlsPrefix = `shared/uploads/hls/${baseFilename}/`;
                      try {
                        const files = await spartaObjectStorage.listFiles(hlsPrefix);
                        logger.info(`Found ${files.length} HLS files to delete for ${baseFilename}`);
                        
                        for (const fileKey of files) {
                          try {
                            await spartaObjectStorage.deleteFile(fileKey);
                          } catch (err) {
                            logger.error(`Failed to delete HLS file ${fileKey}: ${err}`);
                          }
                        }
                      } catch (err) {
                        logger.error(`Failed to list HLS files for ${baseFilename}: ${err}`);
                      }
                      
                      // Delete the HLS source thumbnail
                      const hlsSourceThumbnail = `shared/uploads/${baseFilename}-hls-source.jpg`;
                      try {
                        await spartaObjectStorage.deleteFile(hlsSourceThumbnail);
                        logger.info(`Deleted HLS source thumbnail: ${hlsSourceThumbnail}`);
                      } catch (err) {
                        // Thumbnail may not exist, that's okay
                      }
                    }
                  } else {
                    // Regular video or image
                    await spartaObjectStorage.deleteFile(mediaUrl);
                    logger.info(`Deleted media file: ${mediaUrl}`);
                    
                    // If it's a video, delete the thumbnail too
                    if (post.is_video) {
                      let filename = '';
                      if (mediaUrl.includes('shared/uploads/')) {
                        filename = mediaUrl.split('shared/uploads/')[1]?.split('?')[0] || '';
                      } else if (mediaUrl.includes('/api/serve-file')) {
                        const match = mediaUrl.match(/filename=([^&]+)/);
                        filename = match ? match[1] : '';
                      } else {
                        filename = mediaUrl.split('/').pop()?.split('?')[0] || '';
                      }
                      
                      if (filename) {
                        let baseFilename = filename.replace(/\.(mp4|mov|avi|mkv|webm|mpg|mpeg)$/i, '');
                        baseFilename = baseFilename.replace(/^shared\/uploads\//, '');
                        
                        // Try multiple thumbnail naming conventions
                        const thumbnailVariations = [
                          `shared/uploads/${baseFilename}.poster.jpg`,
                          `shared/uploads/${baseFilename}.jpg`,
                          `shared/uploads/${baseFilename}.jpeg`,
                          `shared/uploads/thumb-${baseFilename}.jpg`,
                        ];
                        
                        for (const thumbnailKey of thumbnailVariations) {
                          try {
                            await spartaObjectStorage.deleteFile(thumbnailKey);
                            logger.info(`Deleted video thumbnail: ${thumbnailKey}`);
                          } catch (err) {
                            // Thumbnail may not exist with this naming, continue
                          }
                        }
                      }
                    }
                  }
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
                  await spartaObjectStorage.deleteFile(mediaUrl);
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
      const organizationId = parseInt(req.params.id);
      if (isNaN(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID" });
      }

      const isAdmin = req.user?.isAdmin;
      const isOrgAdmin = req.user?.isOrganizationAdmin && req.user?.adminOrganizationId === organizationId;

      if (!isAdmin && !isOrgAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Organization Admins can only edit name and description
      if (isOrgAdmin && !isAdmin) {
        const allowedFields = ["name", "description"];
        const bodyKeys = Object.keys(req.body);
        const disallowed = bodyKeys.filter(k => !allowedFields.includes(k));
        if (disallowed.length > 0) {
          return res.status(403).json({ message: "Organization Admins can only edit name and description" });
        }
      }

      // Validate status field if present
      if (req.body.status !== undefined) {
        const statusSchema = z.object({ status: z.number().int().min(0).max(1) });
        const statusValidation = statusSchema.safeParse({ status: req.body.status });
        if (!statusValidation.success) {
          return res.status(400).json({ message: "Status must be 0 or 1" });
        }
      }

      // Validate isPrivate field if present
      if (req.body.isPrivate !== undefined) {
        if (typeof req.body.isPrivate !== "boolean") {
          return res.status(400).json({ message: "isPrivate must be a boolean" });
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
      res.status(500).json({ message: "Failed to fetch divisions" });
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
          message: "Invalid division data",
          errors: parsedData.error.errors,
        });
      }

      const [parentOrg] = await db.select().from(organizations).where(eq(organizations.id, parsedData.data.organizationId)).limit(1);
      if (parentOrg && parentOrg.name.trim().toLowerCase() === parsedData.data.name.trim().toLowerCase()) {
        return res.status(400).json({ message: "Division name cannot be the same as the organization name" });
      }

      const existingGroups = await db.select().from(groups).where(eq(groups.organizationId, parsedData.data.organizationId));
      if (existingGroups.some(g => g.name.trim().toLowerCase() === parsedData.data.name.trim().toLowerCase())) {
        return res.status(400).json({ message: "A division with this name already exists in this organization" });
      }

      const group = await storage.createGroup(parsedData.data);
      logger.info(`Created group: ${group.name} by user ${req.user.id}`);
      res.status(201).json(group);
    } catch (error) {
      logger.error("Error creating group:", error);
      res.status(500).json({
        message: "Failed to create division",
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
        return res.status(400).json({ message: "Invalid division ID" });
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
        message: "Failed to get division delete info",
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
        return res.status(400).json({ message: "Invalid division ID" });
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
            const postsWithMedia = userPosts.filter(p => p.mediaUrl);
            
            // Delete media files with proper HLS and thumbnail handling
            for (const post of postsWithMedia) {
              const mediaUrl = post.mediaUrl as string;
              try {
                if (mediaUrl.includes('/api/hls/')) {
                  const hlsMatch = mediaUrl.match(/\/api\/hls\/([^/]+)\//);
                  if (hlsMatch) {
                    const baseFilename = hlsMatch[1];
                    const hlsPrefix = `shared/uploads/hls/${baseFilename}/`;
                    try {
                      const files = await spartaObjectStorage.listFiles(hlsPrefix);
                      for (const fileKey of files) {
                        try { await spartaObjectStorage.deleteFile(fileKey); } catch (err) {}
                      }
                    } catch (err) {}
                    try { await spartaObjectStorage.deleteFile(`shared/uploads/${baseFilename}-hls-source.jpg`); } catch (err) {}
                  }
                } else {
                  await spartaObjectStorage.deleteFile(mediaUrl);
                  if (post.is_video) {
                    let filename = '';
                    if (mediaUrl.includes('shared/uploads/')) {
                      filename = mediaUrl.split('shared/uploads/')[1]?.split('?')[0] || '';
                    } else if (mediaUrl.includes('/api/serve-file')) {
                      const match = mediaUrl.match(/filename=([^&]+)/);
                      filename = match ? match[1] : '';
                    } else {
                      filename = mediaUrl.split('/').pop()?.split('?')[0] || '';
                    }
                    if (filename) {
                      let baseFilename = filename.replace(/\.(mp4|mov|avi|mkv|webm|mpg|mpeg)$/i, '').replace(/^shared\/uploads\//, '');
                      const thumbnailVariations = [
                        `shared/uploads/${baseFilename}.poster.jpg`,
                        `shared/uploads/${baseFilename}.jpg`,
                        `shared/uploads/${baseFilename}.jpeg`,
                        `shared/uploads/thumb-${baseFilename}.jpg`,
                      ];
                      for (const thumbnailKey of thumbnailVariations) {
                        try { await spartaObjectStorage.deleteFile(thumbnailKey); } catch (err) {}
                      }
                    }
                  }
                }
              } catch (err) {
                logger.error(`Failed to delete media file ${mediaUrl}:`, err);
              }
            }
            logger.info(`Deleted media files for group ${groupId}`);

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
                await spartaObjectStorage.deleteFile(mediaUrl);
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
      res.status(200).json({ message: "Division deleted successfully" });
    } catch (error) {
      logger.error(`Error deleting group ${req.params.id}:`, error);
      res.status(500).json({
        message: "Failed to delete division",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update group endpoint
  router.patch("/api/groups/:id", authenticate, async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid division ID" });
      }

      // Check authorization
      const isFullAdmin = req.user?.isAdmin;
      const isGroupAdminForThisGroup = req.user?.isGroupAdmin && req.user?.adminGroupId === groupId;

      // Check if user is Organization Admin for the org that owns this group
      let isOrgAdminForThisGroup = false;
      if (req.user?.isOrganizationAdmin && req.user?.adminOrganizationId) {
        const [groupRecord] = await db
          .select({ organizationId: groups.organizationId })
          .from(groups)
          .where(eq(groups.id, groupId))
          .limit(1);
        if (groupRecord && groupRecord.organizationId === req.user.adminOrganizationId) {
          isOrgAdminForThisGroup = true;
        }
      }

      logger.info(`Group update attempt by user ${req.user?.id}:`, {
        groupId,
        isFullAdmin,
        isGroupAdmin: req.user?.isGroupAdmin,
        adminGroupId: req.user?.adminGroupId,
        isGroupAdminForThisGroup,
        isOrgAdminForThisGroup,
        requestBody: req.body
      });

      if (!isFullAdmin && !isGroupAdminForThisGroup && !isOrgAdminForThisGroup) {
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

          const groupName = authorizedGroup?.name || `Division ${req.user.adminGroupId}`;
          return res.status(403).json({
            message: `Not authorized to make changes to this division. You are Division Admin for ${groupName} only.`
          });
        }

        return res.status(403).json({ message: "Not authorized" });
      }

      // Validate status field if present (only Full Admins can change status)
      if (req.body.status !== undefined) {
        if (!isFullAdmin) {
          return res.status(403).json({ message: "Only Full Admins can change division status" });
        }
        const statusSchema = z.object({ status: z.number().int().min(0).max(1) });
        const statusValidation = statusSchema.safeParse({ status: req.body.status });
        if (!statusValidation.success) {
          return res.status(400).json({ message: "Status must be 0 or 1" });
        }
      }

      // Group Admins and Org Admins can only update certain fields (not organizationId or status)
      let updateData: any = {};
      if ((isGroupAdminForThisGroup || isOrgAdminForThisGroup) && !isFullAdmin) {
        // Group admins and org admins can only update name, description, competitive status, and program start date
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

      if (updateData.name) {
        const [currentGroup] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
        if (currentGroup) {
          const [parentOrg] = await db.select().from(organizations).where(eq(organizations.id, currentGroup.organizationId)).limit(1);
          if (parentOrg && parentOrg.name.trim().toLowerCase() === updateData.name.trim().toLowerCase()) {
            return res.status(400).json({ message: "Division name cannot be the same as the organization name" });
          }

          const existingGroups = await db.select().from(groups).where(
            and(eq(groups.organizationId, currentGroup.organizationId), ne(groups.id, groupId))
          );
          if (existingGroups.some(g => g.name.trim().toLowerCase() === updateData.name.trim().toLowerCase())) {
            return res.status(400).json({ message: "A division with this name already exists in this organization" });
          }
        }
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
        message: "Failed to update division",
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
        return res.status(400).json({ message: "Invalid division ID" });
      }

      // Check if user is admin, group admin for this group, or org admin for this group's org
      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisGroup = req.user?.isGroupAdmin && req.user?.adminGroupId === groupId;
      
      // Look up group to check org admin
      const [groupRecord] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
      const isOrgAdminForThisGroup = req.user?.isOrganizationAdmin && groupRecord?.organizationId === req.user?.adminOrganizationId;

      if (!isAdmin && !isGroupAdminForThisGroup && !isOrgAdminForThisGroup) {
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
        return res.status(404).json({ message: "Division not found" });
      }

      res.status(201).json({ code, type: "group_admin" });
    } catch (error) {
      logger.error("Error creating group admin invite code:", error);
      res.status(500).json({ message: "Failed to create invite code" });
    }
  });

  // Generate invite code for Group Member
  router.post("/api/invite-codes/group-member/:groupId", authenticate, async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid division ID" });
      }

      // Check if user is admin, group admin for this group, or org admin for this group's org
      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisGroup = req.user?.isGroupAdmin && req.user?.adminGroupId === groupId;
      
      const [groupRecord] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
      const isOrgAdminForThisGroup = req.user?.isOrganizationAdmin && groupRecord?.organizationId === req.user?.adminOrganizationId;

      if (!isAdmin && !isGroupAdminForThisGroup && !isOrgAdminForThisGroup) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Generate unique code
      const code = `GM-${groupId}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      // Update the group with the new invite code
      const [updatedGroup] = await db
        .update(groups)
        .set({ groupMemberInviteCode: code })
        .where(eq(groups.id, groupId))
        .returning();

      if (!updatedGroup) {
        return res.status(404).json({ message: "Division not found" });
      }

      res.status(201).json({ code, type: "group_member" });
    } catch (error) {
      logger.error("Error creating group member invite code:", error);
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

      // Check if user is admin, group admin for this team's group, org admin, or team lead for this team
      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisTeam = req.user?.isGroupAdmin && req.user?.adminGroupId === team.groupId;
      const isTeamLeadForThisTeam = req.user?.isTeamLead && req.user?.teamId === teamId;
      
      const [teamGroup] = await db.select().from(groups).where(eq(groups.id, team.groupId)).limit(1);
      const isOrgAdminForThisTeam = req.user?.isOrganizationAdmin && teamGroup?.organizationId === req.user?.adminOrganizationId;

      if (!isAdmin && !isGroupAdminForThisTeam && !isTeamLeadForThisTeam && !isOrgAdminForThisTeam) {
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

      // Check if user is admin, group admin for this team's group, org admin, or team lead for this team
      const isAdmin = req.user?.isAdmin;
      const isGroupAdminForThisTeam = req.user?.isGroupAdmin && req.user?.adminGroupId === team.groupId;
      const isTeamLeadForThisTeam = req.user?.isTeamLead && req.user?.teamId === teamId;
      
      const [teamGroup2] = await db.select().from(groups).where(eq(groups.id, team.groupId)).limit(1);
      const isOrgAdminForThisTeam = req.user?.isOrganizationAdmin && teamGroup2?.organizationId === req.user?.adminOrganizationId;

      if (!isAdmin && !isGroupAdminForThisTeam && !isTeamLeadForThisTeam && !isOrgAdminForThisTeam) {
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

  // GET invite code routes for groups and teams moved to invite-code-routes.ts to avoid duplication
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

        return res.json({
          currentWeek: programHasStarted ? 1 : null,
          currentDay: programHasStarted ? (userLocalNow.getDay() === 0 ? 7 : userLocalNow.getDay()) : null,
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

      // Calculate current day within the program week (1-7)
      const currentDay = (daysSinceStart % 7) + 1;

      // Check if program has started - true if daysSinceStart is 0 or positive
      const programHasStarted = !!(user.programStartDate && daysSinceStart >= 0);

      // Don't allow negative weeks/days
      const week = Math.max(1, currentWeek);
      const day = Math.max(1, currentDay);

      res.json({
        currentWeek: week,
        currentDay: day,
        programStartDate: user.programStartDate,
        daysSinceStart: daysSinceStart,
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
        // Download the video file temporarily to extract thumbnail
        const videoKey = filename.startsWith("shared/")
          ? filename
          : `shared/uploads/${filename}`;
        console.log(
          `Attempting to download video from Object Storage: ${videoKey}`,
        );

        const videoBuffer = await spartaObjectStorage.downloadFile(videoKey);

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

  // Upload user profile image
  router.post("/api/user/image", authenticate, upload.single("image"), async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      if (!req.file) return res.status(400).json({ message: "No image file provided" });

      console.log("[PROFILE IMAGE] User", req.user.id, "uploading profile image");

      // Process and compress the image
      const processedImage = await sharp(req.file.buffer)
        .rotate()
        .resize(300, 300, {
          fit: "cover",
          position: "center",
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Convert to base64 data URL
      const imageUrl = `data:image/jpeg;base64,${processedImage.toString('base64')}`;

      // Update user's imageUrl in database
      const [updatedUser] = await db
        .update(users)
        .set({ imageUrl })
        .where(eq(users.id, req.user.id))
        .returning();

      console.log("[PROFILE IMAGE] Successfully saved profile image to database for user:", req.user.id);

      res.json({
        message: "Profile image uploaded successfully",
        imageUrl: updatedUser.imageUrl,
      });
    } catch (error) {
      console.error("[PROFILE IMAGE] Error uploading profile image:", error);
      res.status(500).json({
        message: "Failed to upload profile image",
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

  router.post("/api/user/connect-organization", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { organizationId } = req.body;
      if (!organizationId || typeof organizationId !== "number") {
        return res.status(400).json({ message: "Valid organization ID is required" });
      }

      if (req.user.teamId) {
        return res.status(400).json({ message: "You are already assigned to a team" });
      }

      const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      if (!org || org.status !== 1 || org.name === "Admin") {
        return res.status(400).json({ message: "Organization not found" });
      }

      await db.update(users).set({ pendingOrganizationId: organizationId }).where(eq(users.id, req.user.id));

      logger.info(`[CONNECT-ORG] User ${req.user.id} connected to organization ${org.name} (ID: ${organizationId})`);
      res.json({ message: "Successfully connected to organization" });
    } catch (error) {
      logger.error("Error connecting to organization:", error);
      res.status(500).json({ message: "Failed to connect to organization" });
    }
  });

  // Update user SMS settings
  router.patch("/api/user/sms", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { phoneNumber, smsEnabled } = req.body;

      const updateData: {
        phoneNumber?: string;
        smsEnabled?: boolean;
      } = {};

      if (phoneNumber !== undefined) {
        updateData.phoneNumber = phoneNumber;
      }

      if (smsEnabled !== undefined) {
        updateData.smsEnabled = smsEnabled;
      }

      // Update user's SMS settings
      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, req.user.id))
        .returning();

      logger.info(`User ${req.user.id} updated SMS settings`);

      res.json({
        message: "SMS settings updated successfully",
        phoneNumber: updatedUser.phoneNumber,
        smsEnabled: updatedUser.smsEnabled,
      });
    } catch (error) {
      logger.error("Error updating SMS settings:", error);
      res.status(500).json({
        message: "Failed to update SMS settings",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Test SMS via Twilio
  router.post("/api/user/sms/test", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      logger.info(`Testing SMS for user ${req.user.id} with phone ${phoneNumber}`);

      // Test SMS delivery via Twilio
      const result = await smsService.testSMS(phoneNumber);

      if (result.success) {
        // Update user's phone number and enable SMS
        await db
          .update(users)
          .set({
            phoneNumber,
            smsEnabled: true,
          })
          .where(eq(users.id, req.user.id));

        logger.info(`SMS test successful for user ${req.user.id}`);

        res.json({
          success: true,
          message: "SMS test sent successfully via Twilio!",
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.error || "Failed to send SMS",
        });
      }
    } catch (error) {
      logger.error("Error testing SMS:", error);
      res.status(500).json({
        message: "Failed to test SMS",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Send SMS to user
  router.post("/api/user/sms/send", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Get user's SMS settings
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!user.phoneNumber) {
        return res.status(400).json({
          message: "SMS not configured. Please test SMS first.",
        });
      }

      if (!user.smsEnabled) {
        return res.status(400).json({
          message: "SMS notifications are disabled.",
        });
      }

      // Send SMS
      await smsService.sendSMSToUser(
        user.phoneNumber,
        message
      );

      logger.info(`SMS sent to user ${req.user.id}`);
      res.json({
        success: true,
        message: "SMS sent successfully",
      });
    } catch (error) {
      logger.error("Error sending SMS:", error);
      res.status(500).json({
        message: "Failed to send SMS",
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

        const { notificationTime, achievementNotificationsEnabled, dailyNotificationsEnabled, confirmationMessagesEnabled, timezoneOffset, phoneNumber, smsEnabled } = req.body;
        // Define update data with proper typing
        const updateData: {
          notificationTime?: string;
          achievementNotificationsEnabled?: boolean;
          dailyNotificationsEnabled?: boolean;
          confirmationMessagesEnabled?: boolean;
          timezoneOffset?: number;
          phoneNumber?: string;
          smsEnabled?: boolean;
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

        // Add daily notifications enabled setting if provided
        if (dailyNotificationsEnabled !== undefined) {
          updateData.dailyNotificationsEnabled = dailyNotificationsEnabled;
          logger.info(`Updating daily notifications for user ${req.user.id} to ${dailyNotificationsEnabled}`);
        }

        // Add confirmation messages enabled setting if provided
        if (confirmationMessagesEnabled !== undefined) {
          updateData.confirmationMessagesEnabled = confirmationMessagesEnabled;
          logger.info(`Updating confirmation messages for user ${req.user.id} to ${confirmationMessagesEnabled}`);
        }

        // Add phone number if provided
        if (phoneNumber !== undefined) {
          const trimmedPhone = phoneNumber.trim();
          updateData.phoneNumber = trimmedPhone || null;
          logger.info(`Updating phone number for user ${req.user.id}`);

          // If phone number is being cleared, also disable SMS
          if (!trimmedPhone) {
            updateData.smsEnabled = false;
            logger.info(`Phone number cleared, disabling SMS for user ${req.user.id}`);
          }
        }

        // Add SMS enabled setting if provided
        if (smsEnabled !== undefined) {
          // Validate that we have a phone number if enabling SMS
          if (smsEnabled) {
            const currentUser = await db
              .select({ phoneNumber: users.phoneNumber })
              .from(users)
              .where(eq(users.id, req.user.id))
              .limit(1);

            const userPhone = phoneNumber !== undefined ? phoneNumber.trim() : currentUser[0]?.phoneNumber;

            if (!userPhone) {
              return res.status(400).json({ 
                message: "Cannot enable SMS notifications without a valid phone number" 
              });
            }

            // Basic validation: must be at least 10 digits
            const digitsOnly = userPhone.replace(/\D/g, '');
            if (digitsOnly.length < 10) {
              return res.status(400).json({ 
                message: "Invalid phone number. Please enter a valid phone number with at least 10 digits" 
              });
            }
          }

          updateData.smsEnabled = smsEnabled;
          logger.info(`Updating SMS notifications for user ${req.user.id} to ${smsEnabled}`);
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

  // Test SMS endpoint
  router.post(
    "/api/users/test-sms",
    authenticate,
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" });

        // Get user's current settings
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, req.user.id))
          .limit(1);

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        if (!user.phoneNumber) {
          return res.status(400).json({ message: "Phone number not set. Please enter your phone number first." });
        }

        if (!user.smsEnabled) {
          return res.status(400).json({ message: "SMS notifications are disabled. Please enable SMS notifications first." });
        }

        // Send test SMS
        await smsService.sendSMSToUser(
          user.phoneNumber,
          "This is a test message from your fitness tracker app. SMS notifications are working!"
        );

        logger.info(`Test SMS sent to user ${req.user.id}`);
        res.json({
          success: true,
          message: "Test SMS sent successfully",
        });
      } catch (error) {
        logger.error("Error sending test SMS:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Failed to send test SMS",
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
        const { spartaObjectStorage } = await import('./sparta-object-storage-final');

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
                  await spartaObjectStorage.deleteFile(filePath);
                  logger.info(`Deleted media file: ${filePath} for post ${post.id}`);
                } catch (err) {
                  logger.error(`Could not delete media file ${filePath}: ${err}`);
                }

                // If it's a video, also delete the thumbnail
                if (post.is_video) {
                  const baseName = filename.substring(0, filename.lastIndexOf('.'));
                  const thumbnailPath = `shared/uploads/${baseName}.jpg`;

                  try {
                    await spartaObjectStorage.deleteFile(thumbnailPath);
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
  app.use(emailVerificationRouter);
  app.use(stripeDonationRouter);

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
      // Disable ETag and caching completely to force fresh data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.removeHeader('ETag');

      // Debug logging for authorization
      console.log('GET /api/users - User authorization check:', {
        userId: req.user?.id,
        isAdmin: req.user?.isAdmin,
        isGroupAdmin: req.user?.isGroupAdmin,
        isTeamLead: req.user?.isTeamLead,
        teamId: req.user?.teamId
      });

      let users = await storage.getAllUsers();

      // Filter users based on role
      if (req.user.isAdmin) {
        // Admins can see all users - no filtering needed
      }
      // Filter users for organization admins - only show users in their org's teams
      else if (req.user.isOrganizationAdmin && req.user.adminOrganizationId) {
        const orgGroups = await db
          .select({ id: groups.id })
          .from(groups)
          .where(eq(groups.organizationId, req.user.adminOrganizationId));
        const orgGroupIds = orgGroups.map(g => g.id);

        const orgTeams = await db
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.groupId, orgGroupIds.length > 0 ? orgGroupIds : [-1]));
        const orgTeamIds = orgTeams.map(t => t.id);

        users = users.filter(user => user.teamId && orgTeamIds.includes(user.teamId));
      }
      // Filter users for group admins - only show users in their group's teams
      else if (req.user.isGroupAdmin && req.user.adminGroupId) {
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
      else if (req.user.isTeamLead && req.user.teamId) {
        users = users.filter(user => user.teamId === req.user.teamId);
      }
      // Filter users forregular users - only show users in their team (excluding themselves)
      else if (req.user.teamId) {
        users = users.filter(user => user.teamId === req.user.teamId && user.id !== req.user.id);
      }
      // If user has no team, return empty array
      else {
        users = [];
      }

      // Calculate currentWeek and currentDay dynamically for each user
      const usersWithCalculatedProgress = users.map(user => {
        if (!user.programStartDate) {
          return user;
        }

        const tzOffset = user.timezoneOffset || 0;
        const now = new Date();
        const userLocalNow = new Date(now.getTime() + tzOffset * 60000);

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

        // Calculate current day based on actual day of week (Monday=1, Sunday=7)
        const jsDay = userLocalNow.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        const currentDay = jsDay === 0 ? 7 : jsDay; // Convert to Monday=1, Sunday=7

        // Don't allow negative weeks/days
        const week = Math.max(1, currentWeek);
        const day = Math.max(1, currentDay);

        return {
          ...user,
          currentWeek: week,
          currentDay: day
        };
      });

      // Explicitly set status to 200 to prevent 304
      res.status(200).json(usersWithCalculatedProgress);
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

  // External cron endpoint for hourly notification checks
  // This is called by an external service (e.g., cron-job.org) every hour
  router.post("/api/check-notifications", express.json(), async (req, res) => {
    try {
      // Verify the API token from header
      const providedToken = req.headers['x-job-token'];
      const expectedToken = process.env.NOTIFICATION_CRON_SECRET;

      if (!expectedToken) {
        logger.error("[CRON] NOTIFICATION_CRON_SECRET not configured");
        return res.status(500).json({ 
          success: false, 
          message: "Server configuration error" 
        });
      }

      if (!providedToken || typeof providedToken !== 'string') {
        logger.warn("[CRON] Missing or invalid token in request");
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }

      // Use timing-safe comparison to prevent timing attacks
      const crypto = await import('crypto');
      const providedBuffer = Buffer.from(providedToken);
      const expectedBuffer = Buffer.from(expectedToken);

      if (providedBuffer.length !== expectedBuffer.length || 
          !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
        logger.warn("[CRON] Invalid token provided");
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }

      // Rate limiting: check if we ran in the last 50 minutes
      const fiftyMinutesAgo = new Date(Date.now() - 50 * 60 * 1000);
      const recentCheck = await db
        .select()
        .from(systemState)
        .where(
          and(
            eq(systemState.key, 'last_notification_check'),
            gte(systemState.updatedAt, fiftyMinutesAgo)
          )
        )
        .limit(1);

      if (recentCheck.length > 0) {
        logger.info("[CRON] Skipping check - last run was less than 50 minutes ago");
        return res.json({
          success: true,
          skipped: true,
          message: "Check skipped - too soon since last run",
          lastCheck: recentCheck[0].updatedAt
        });
      }

      // Import and run the notification check
      const { checkNotifications } = await import('./notification-check');
      const result = await checkNotifications();

      res.json({
        success: true,
        ...result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error("[CRON] Error in notification check endpoint:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error"
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
            avatarColor: users.avatarColor,
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
      
      // Get current date/time adjusted by user's timezone if available
      const tzOffset = req.user.timezoneOffset || 0; // in minutes
      const now = new Date(Date.now() + (tzOffset * 60000));
      
      // Get start of week (Monday)
      const startOfWeek = new Date(now);
      const day = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      
      // Adjust to get Monday: if Sunday (0), go back 6 days, otherwise go back (day-1) days
      const dayDiff = day === 0 ? 6 : day - 1;
      
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(now.getDate() - dayDiff);

      // Get end of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Convert back to UTC for database queries
      const queryStart = new Date(startOfWeek.getTime() - (tzOffset * 60000));
      const queryEnd = new Date(endOfWeek.getTime() - (tzOffset * 60000));

      const result = await db
        .select({
          points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, queryStart),
            lte(posts.createdAt, queryEnd),
            isNull(posts.parentId), // Don't count comments
          ),
        );

      // Ensure this endpoint also has consistent content-type
      res.setHeader("Content-Type", "application/json");
      res.json({
        points: result[0]?.points || 0,
        startDate: queryStart.toISOString(),
        endDate: queryEnd.toISOString(),
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

      // Get current date/time adjusted by user's timezone if available
      const tzOffset = req.user.timezoneOffset || 0; // in minutes
      const now = new Date(Date.now() + (tzOffset * 60000));

      // Get start of week (Monday)
      const startOfWeek = new Date(now);
      const day = now.getDay();
      // Adjust to get Monday: if Sunday (0), go back 6 days, otherwise go back (day-1) days
      const dayDiff = day === 0 ? 6 : day - 1;
      
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(now.getDate() - dayDiff);

      // Get end of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Convert back to UTC for database queries
      const queryStart = new Date(startOfWeek.getTime() - (tzOffset * 60000));
      const queryEnd = new Date(endOfWeek.getTime() - (tzOffset * 60000));

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
          preferredName: users.preferredName,
          imageUrl: users.imageUrl,
          avatarColor: users.avatarColor,
          points: sql<number>`COALESCE((
            SELECT SUM(p.points)
            FROM posts p
            WHERE p.user_id = users.id
            AND p.created_at >= ${queryStart}
            AND p.created_at <= ${queryEnd}
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
            LEFT JOIN posts p ON p.user_id = u.id AND p.created_at >= ${queryStart} AND p.created_at <= ${queryEnd} AND p.parent_id IS NULL
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
          start: queryStart.toISOString(),
          end: queryEnd.toISOString(),
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

  // File cache for video streaming to avoid re-downloading from Object Storage
  const fileCache = new Map<string, { buffer: Buffer; timestamp: number; size: number }>();
  const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200MB max cache
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  function getCachedFile(key: string): Buffer | null {
    const cached = fileCache.get(key);
    if (!cached) return null;
    
    // Check if cache entry expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      fileCache.delete(key);
      logger.info(`Cache expired for ${key}`);
      return null;
    }
    
    logger.info(`Cache hit for ${key}`);
    return cached.buffer;
  }

  function setCachedFile(key: string, buffer: Buffer): void {
    // Calculate current cache size
    let currentSize = 0;
    for (const entry of fileCache.values()) {
      currentSize += entry.size;
    }
    
    // Evict oldest entries if cache is full
    while (currentSize + buffer.length > MAX_CACHE_SIZE && fileCache.size > 0) {
      const oldestKey = fileCache.keys().next().value;
      const oldestEntry = fileCache.get(oldestKey);
      if (oldestEntry) {
        currentSize -= oldestEntry.size;
        fileCache.delete(oldestKey);
        logger.info(`Evicted ${oldestKey} from cache (size: ${oldestEntry.size} bytes)`);
      }
    }
    
    // Only cache if file fits in cache
    if (buffer.length <= MAX_CACHE_SIZE) {
      fileCache.set(key, { buffer, timestamp: Date.now(), size: buffer.length });
      logger.info(`Cached ${key} (size: ${buffer.length} bytes, total entries: ${fileCache.size})`);
    } else {
      logger.warn(`File ${key} too large to cache (${buffer.length} bytes)`);
    }
  }

  // Migrate old large videos to HLS format
  app.post("/api/migrate-videos-to-hls", async (req: AuthRequest, res: Response) => {
    try {
      // Only allow admin users
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      logger.info('[HLS Migration] Starting migration of large videos to HLS format');

      // Find all posts with video URLs pointing to direct-download
      const videoPosts = await db
        .select({
          id: posts.id,
          mediaUrl: posts.mediaUrl,
        })
        .from(posts)
        .where(
          and(
            isNotNull(posts.mediaUrl),
            like(posts.mediaUrl, '%/api/object-storage/direct-download%')
          )
        );

      logger.info(`[HLS Migration] Found ${videoPosts.length} posts with direct-download videos`);

      const results = {
        total: videoPosts.length,
        converted: 0,
        skipped: 0,
        failed: 0,
        errors: [] as string[],
      };

      const { spartaObjectStorage } = await import("./sparta-object-storage-final");
      const { HLSConverter } = await import('./hls-converter');
      const { hlsConverter } = await import('./hls-converter');
      const fs = await import("fs");

      for (const post of videoPosts) {
        try {
          // Extract storage key from URL
          const urlParams = new URLSearchParams(post.mediaUrl!.split('?')[1]);
          const storageKey = urlParams.get('storageKey');
          
          if (!storageKey) {
            logger.warn(`[HLS Migration] Post ${post.id}: No storage key found in URL`);
            results.skipped++;
            continue;
          }

          // Download video to check size
          const videoBuffer = await spartaObjectStorage.downloadFile(storageKey);
          const fileSize = videoBuffer.length;

          // Check if video needs HLS conversion
          if (!HLSConverter.shouldConvertToHLS(fileSize)) {
            logger.info(`[HLS Migration] Post ${post.id}: Video too small (${(fileSize / 1024 / 1024).toFixed(2)} MB), skipping`);
            results.skipped++;
            continue;
          }

          logger.info(`[HLS Migration] Post ${post.id}: Converting video (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

          // Extract filename
          const filename = storageKey.split('/').pop() || '';
          const baseFilename = filename.replace('.mp4', '');
          const playlistKey = `shared/uploads/hls/${baseFilename}/playlist.m3u8`;

          // Check if HLS version already exists
          try {
            await spartaObjectStorage.downloadFile(playlistKey);
            logger.info(`[HLS Migration] Post ${post.id}: HLS version already exists`);
            
            // Update database URL even if HLS exists
            const newMediaUrl = `/api/hls/${baseFilename}/playlist.m3u8`;
            await db
              .update(posts)
              .set({ mediaUrl: newMediaUrl })
              .where(eq(posts.id, post.id));
            
            results.converted++;
            continue;
          } catch {
            // HLS doesn't exist, convert now
          }

          // Write video to temp file for conversion
          const tempVideoPath = `/tmp/${filename}`;
          fs.writeFileSync(tempVideoPath, videoBuffer);

          try {
            // Convert to HLS
            await hlsConverter.convertToHLS(tempVideoPath, baseFilename);
            
            // Update database with new HLS URL
            const newMediaUrl = `/api/hls/${baseFilename}/playlist.m3u8`;
            await db
              .update(posts)
              .set({ mediaUrl: newMediaUrl })
              .where(eq(posts.id, post.id));

            logger.info(`[HLS Migration] Post ${post.id}: Successfully converted and updated URL`);
            results.converted++;

            // Clean up temp file
            fs.unlinkSync(tempVideoPath);
          } catch (conversionError) {
            logger.error(`[HLS Migration] Post ${post.id}: Conversion failed:`, conversionError);
            results.failed++;
            results.errors.push(`Post ${post.id}: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`);
            
            // Clean up temp file
            if (fs.existsSync(tempVideoPath)) {
              fs.unlinkSync(tempVideoPath);
            }
          }
        } catch (error) {
          logger.error(`[HLS Migration] Post ${post.id}: Error processing:`, error);
          results.failed++;
          results.errors.push(`Post ${post.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      logger.info(`[HLS Migration] Complete: ${results.converted} converted, ${results.skipped} skipped, ${results.failed} failed`);
      return res.json(results);
    } catch (error) {
      logger.error("[HLS Migration] Migration failed:", error);
      return res.status(500).json({ error: "Migration failed", message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Regenerate thumbnail for a video
  app.post("/api/regenerate-thumbnail", async (req: AuthRequest, res: Response) => {
    try {
      const { videoFilename } = req.body;
      
      if (!videoFilename) {
        return res.status(400).json({ error: "Video filename required" });
      }

      logger.info(`Regenerating thumbnail for: ${videoFilename}`);

      // Import dependencies
      const { createMovThumbnail } = await import("./mov-frame-extractor-new");
      const { spartaObjectStorage } = await import("./sparta-object-storage-final");
      const fs = await import("fs");
      const path = await import("path");

      // Download video from Object Storage
      const storageKey = `shared/uploads/${videoFilename}`;
      const videoBuffer = await spartaObjectStorage.downloadFile(storageKey);
      
      // Write to temp file
      const tempVideoPath = `/tmp/${videoFilename}`;
      fs.writeFileSync(tempVideoPath, videoBuffer);

      // Generate thumbnail
      const thumbnailFilename = await createMovThumbnail(tempVideoPath);

      // Clean up temp file
      fs.unlinkSync(tempVideoPath);

      if (thumbnailFilename) {
        logger.info(`Successfully regenerated thumbnail: ${thumbnailFilename}`);
        return res.json({ success: true, thumbnailFilename });
      } else {
        return res.status(500).json({ error: "Thumbnail generation failed" });
      }
    } catch (error) {
      logger.error("Error regenerating thumbnail:", error);
      return res.status(500).json({ error: "Failed to regenerate thumbnail" });
    }
  });

  // Main file serving route with HTTP range request support for video streaming
  app.get("/api/serve-file", async (req: Request, res: Response) => {
    try {
      const filename = req.query.filename as string;

      if (!filename) {
        return res
          .status(400)
          .json({ error: "Filename parameter is required" });
      }

      logger.info(`Serving file: ${filename}`, { route: "/api/serve-file" });

      // Import the Object Storage utility
      const { spartaObjectStorage } = await import("./sparta-object-storage-final");

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

      // Set appropriate content type
      const ext = filename.toLowerCase().split(".").pop();
      let contentType = "application/octet-stream";
      let isVideo = false;

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
          isVideo = true;
          break;
        case "mov":
          contentType = "video/quicktime";
          isVideo = true;
          break;
        case "webm":
          contentType = "video/webm";
          isVideo = true;
          break;
      }

      // Set common headers
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
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
        "Origin, X-Requested-With, Content-Type, Accept, Range",
      );
      res.setHeader("Accept-Ranges", "bytes");

      // Handle videos with disk-backed streaming cache
      if (isVideo) {
        let filePath: string;
        
        // Check if this is a .mov file that needs conversion
        const isMovFile = ext === 'mov';
        
        if (isMovFile) {
          // Use MOV conversion cache manager for .mov files
          logger.info(`MOV file detected: ${storageKey}, converting to MP4`);
          const { movConversionCacheManager } = await import("./mov-conversion-cache-manager");
          
          // Get converted MP4 file path (converts if needed)
          filePath = await movConversionCacheManager.getConvertedMp4(storageKey);
          
          // Override content type to MP4 since we're serving a converted file
          res.setHeader("Content-Type", "video/mp4");
        } else {
          // Use regular video cache manager for other video formats
          const { videoCacheManager } = await import("./video-cache-manager");
          
          // Get file path from cache (downloads if needed)
          filePath = await videoCacheManager.getVideoFile(storageKey);
        }
        
        const stats = await import("fs").then(fs => fs.promises.stat(filePath));
        const fileSize = stats.size;

        const range = req.headers.range;
        if (range) {
          // Parse range header (e.g., "bytes=0-1023")
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          logger.info(`Streaming range ${start}-${end}/${fileSize} from disk: ${storageKey}`);

          // Stream from disk (no memory overhead)
          const fs = await import("fs");
          const stream = fs.createReadStream(filePath, { start, end });

          // Send 206 Partial Content response
          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
          res.setHeader("Content-Length", chunkSize);
          
          // Handle stream errors
          stream.on('error', (error) => {
            logger.error(`[VIDEO SERVE ERROR] Stream error for ${storageKey}:`, {
              error: error.message,
              stack: error.stack,
              filePath,
              start,
              end,
              fileSize,
              endpoint: '/api/serve-file'
            });
            if (!res.headersSent) {
              res.status(500).json({ 
                error: 'Stream error',
                message: error.message,
                details: `Failed to stream ${storageKey} from ${filePath}`
              });
            }
          });

          stream.on('end', () => {
            logger.info(`Stream completed for ${storageKey}: bytes ${start}-${end}`);
          });
          
          return stream.pipe(res);
        } else {
          // Send entire file from disk
          logger.info(`Streaming entire video from disk: ${storageKey}, size: ${fileSize}`);
          const fs = await import("fs");
          const stream = fs.createReadStream(filePath);
          
          // Handle stream errors
          stream.on('error', (error) => {
            logger.error(`[VIDEO SERVE ERROR] Stream error for ${storageKey} (full file):`, {
              error: error.message,
              stack: error.stack,
              filePath,
              fileSize,
              endpoint: '/api/serve-file'
            });
            if (!res.headersSent) {
              res.status(500).json({ 
                error: 'Stream error',
                message: error.message,
                details: `Failed to stream ${storageKey} from ${filePath}`
              });
            }
          });

          stream.on('end', () => {
            logger.info(`Stream completed for ${storageKey}`);
          });
          
          res.setHeader("Content-Length", fileSize);
          return stream.pipe(res);
        }
      }

      // For small files (images, thumbnails), use in-memory cache
      let fileBuffer: Buffer | null = getCachedFile(storageKey);
      
      if (!fileBuffer) {
        logger.info(`Downloading ${storageKey} from Object Storage (not in cache)`);
        const result = await spartaObjectStorage.downloadFile(storageKey);
        
        // Handle the Object Storage response format
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
          throw new Error(`Unexpected Object Storage response format for ${storageKey}`);
        }
        
        setCachedFile(storageKey, fileBuffer);
      }

      res.setHeader("Content-Length", fileBuffer.length);
      logger.info(`Served file: ${storageKey}, size: ${fileBuffer.length} bytes`);
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

  // Direct download route for files stored in Object Storage with Range support for video streaming
  app.get("/api/object-storage/direct-download", async (req: Request, res: Response) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[REQ START v4] New request ${requestId} - storageKey: ${req.query.storageKey}, range: ${req.headers.range}, method: ${req.method}`);
    
    try {
      const storageKey = req.query.storageKey as string;

      if (!storageKey) {
        console.error(`[REQ ERROR v4] ${requestId}: Missing storageKey`);
        return res.status(400).json({ error: "storageKey parameter is required" });
      }

      console.log(`[REQ v4] ${requestId}: Direct download: ${storageKey}, route: /api/object-storage/direct-download, range: ${req.headers.range}`);

      // Import the Object Storage utility
      const { spartaObjectStorage } = await import("./sparta-object-storage-final");

      // Determine content type from file extension
      const ext = storageKey.toLowerCase().split(".").pop();
      let contentType = "application/octet-stream";
      let isVideo = false;

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
        case "mp4":
          contentType = "video/mp4";
          isVideo = true;
          break;
        case "mov":
          contentType = "video/quicktime";
          isVideo = true;
          break;
        case "webm":
          contentType = "video/webm";
          isVideo = true;
          break;
      }

      // Set common headers
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "https://a0341f86-dcd3-4fbd-8a10-9a1965e07b56-00-2cetph4iixb13.worf.replit.dev");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
      res.setHeader("Accept-Ranges", "bytes");

      // Handle videos - use buffer slicing for production-compatible 206 range responses
      if (isVideo) {
        console.log(`[VIDEO v5] ${requestId}: Video detected: ${storageKey}, range: ${req.headers.range || 'none'}`);
        
        try {
          // Download full video from Object Storage and cache it
          const videoBuffer = await spartaObjectStorage.downloadFile(storageKey);
          const fileSize = videoBuffer.length;
          console.log(`[VIDEO v5] ${requestId}: Downloaded ${fileSize} bytes from Object Storage`);
          
          // Check if large video needs HLS conversion (on-demand for old videos)
          const { HLSConverter } = await import('./hls-converter');
          if (HLSConverter.shouldConvertToHLS(fileSize)) {
            console.log(`[VIDEO v5] ${requestId}: Large video detected (${(fileSize / 1024 / 1024).toFixed(2)} MB), checking for HLS version`);
            
            // Extract filename from storageKey
            const filename = storageKey.split('/').pop() || '';
            const baseFilename = filename.replace('.mp4', '');
            const playlistKey = `shared/uploads/hls/${baseFilename}/playlist.m3u8`;
            
            // Check if HLS playlist already exists
            try {
              await spartaObjectStorage.downloadFile(playlistKey);
              console.log(`[VIDEO v5] ${requestId}: HLS version exists, redirecting to playlist`);
              // Redirect to HLS playlist
              return res.redirect(302, `/api/hls/${baseFilename}/playlist.m3u8`);
            } catch (playlistError) {
              // HLS doesn't exist, convert now
              console.log(`[VIDEO v5] ${requestId}: HLS version not found, converting on-demand`);
              
              // Write video to temp file for conversion
              const tempVideoPath = `/tmp/${filename}`;
              fs.writeFileSync(tempVideoPath, videoBuffer);
              
              try {
                const { hlsConverter } = await import('./hls-converter');
                await hlsConverter.convertToHLS(tempVideoPath, baseFilename);
                
                console.log(`[VIDEO v5] ${requestId}: On-demand HLS conversion complete, redirecting to playlist`);
                
                // Clean up temp file
                fs.unlinkSync(tempVideoPath);
                
                // Redirect to HLS playlist
                return res.redirect(302, `/api/hls/${baseFilename}/playlist.m3u8`);
              } catch (conversionError) {
                console.error(`[VIDEO v5] ${requestId}: On-demand HLS conversion failed: ${conversionError}`);
                // Clean up temp file
                if (fs.existsSync(tempVideoPath)) {
                  fs.unlinkSync(tempVideoPath);
                }
                // Fall through to regular video serving (will likely fail in production, but better than crashing)
              }
            }
          }
          
          // Parse range header if present
          const range = req.headers.range;
          if (range) {
            // Parse range header (e.g., "bytes=0-1", "bytes=1024-2048")
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            
            // Validate range
            if (start >= fileSize || end >= fileSize || start > end) {
              console.error(`[VIDEO v5] ${requestId}: Invalid range ${range} for file size ${fileSize}`);
              return res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
            }
            
            const chunkSize = end - start + 1;
            console.log(`[VIDEO v5] ${requestId}: Range request ${range} -> slice [${start}, ${end}] = ${chunkSize} bytes`);
            
            // Slice the buffer to get the requested range
            const chunk = videoBuffer.slice(start, end + 1);
            
            // Send 206 Partial Content with the chunk
            res.status(206);
            res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
            res.setHeader("Content-Length", chunkSize);
            res.setHeader("Content-Type", contentType);
            res.setHeader("Accept-Ranges", "bytes");
            
            console.log(`[VIDEO v5] ${requestId}: Sending 206 response: ${chunkSize} bytes (${start}-${end}/${fileSize})`);
            res.end(chunk);
            console.log(`[VIDEO v5] ${requestId}: 206 response completed`);
            return;
          } else {
            // No range header - send full file as 200
            console.log(`[VIDEO v5] ${requestId}: No range header, sending full file (${fileSize} bytes)`);
            res.setHeader("Content-Length", fileSize);
            res.setHeader("Content-Type", contentType);
            res.setHeader("Accept-Ranges", "bytes");
            res.end(videoBuffer);
            console.log(`[VIDEO v5] ${requestId}: 200 response completed`);
            return;
          }
        } catch (downloadError) {
          console.error(`[VIDEO v5 ERROR] ${requestId}: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`);
          if (!res.headersSent) {
            return res.status(500).json({ 
              error: 'Video download failed', 
              message: downloadError instanceof Error ? downloadError.message : 'Unknown error'
            });
          }
          return;
        }
        
      }
      
      /* OLD STREAMING CODE - DISABLED due to production infrastructure issues
        const isMovFile = ext === 'mov';
        if (isMovFile) {
          console.log(`[MOV PATH v4] ${requestId}: MOV file detected: ${storageKey}, converting to MP4`);
          const { movConversionCacheManager } = await import("./mov-conversion-cache-manager");
          
          // Get converted MP4 file path (converts if needed)
          const filePath = await movConversionCacheManager.getConvertedMp4(storageKey);
          
          // Override content type to MP4 since we're serving a converted file
          res.setHeader("Content-Type", "video/mp4");
          
          const stats = await import("fs").then(fs => fs.promises.stat(filePath));
          const fileSize = stats.size;

          const range = req.headers.range;
          if (range) {
            // Parse range header (e.g., "bytes=0-1023")
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            logger.info(`Streaming MOV range ${start}-${end}/${fileSize} from disk: ${storageKey}`);

            // Stream from disk (no memory overhead)
            const fs = await import("fs");
            const stream = fs.createReadStream(filePath, { start, end });

            // Send 206 Partial Content response
            res.status(206);
            res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
            res.setHeader("Content-Length", chunkSize);
            
            // Handle stream errors
            stream.on('error', (error) => {
              logger.error(`Stream error for ${storageKey}:`, error);
              if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error' });
              }
            });

            stream.on('end', () => {
              logger.info(`Stream completed for ${storageKey}: bytes ${start}-${end}`);
            });
            
            return stream.pipe(res);
          } else {
            // Send entire file from disk
            logger.info(`Streaming entire MOV video from disk: ${storageKey}, size: ${fileSize}`);
            const fs = await import("fs");
            const stream = fs.createReadStream(filePath);
            
            // Handle stream errors
            stream.on('error', (error) => {
              logger.error(`Stream error for ${storageKey}:`, error);
              if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error' });
              }
            });

            stream.on('end', () => {
              logger.info(`Stream completed for ${storageKey}`);
            });
            
            res.setHeader("Content-Length", fileSize);
            return stream.pipe(res);
          }
        } else {
          // MP4/WEBM files - use cache manager with extended timeout for production
          console.log(`[MP4 PATH v4] ${requestId}: MP4/WEBM file detected: ${storageKey}`);
          console.log(`[VIDEO STREAM v4] ${requestId}: Starting MP4/WEBM video stream: ${storageKey}`);
          const { videoCacheManager } = await import("./video-cache-manager");
          
          try {
            // Get file path from cache (downloads if needed, with timeout handling)
            console.log(`[VIDEO STREAM v4] ${requestId}: Getting video file from cache: ${storageKey}`);
            const filePath = await videoCacheManager.getVideoFile(storageKey);
            console.log(`[VIDEO STREAM v4] ${requestId}: Video file path obtained: ${filePath}`);
            
            const stats = await import("fs").then(fs => fs.promises.stat(filePath));
            const fileSize = stats.size;
            console.log(`[VIDEO STREAM v4] ${requestId}: File stats - size: ${fileSize}, path: ${filePath}`);

            const range = req.headers.range;
            if (range) {
              // Parse range header (e.g., "bytes=0-1023")
              const parts = range.replace(/bytes=/, "").split("-");
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
              const chunkSize = end - start + 1;

              console.log(`[VIDEO STREAM v4] ${requestId}: Range request: ${start}-${end}/${fileSize} (${chunkSize} bytes)`);

              // Stream from disk (no memory overhead)
              const fs = await import("fs");
              
              try {
                console.log(`[STREAM CREATE v4] ${requestId}: Creating read stream for ${filePath}, range ${start}-${end}`);
                const stream = fs.createReadStream(filePath, { start, end });

                // Send 206 Partial Content response
                res.status(206);
                res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
                res.setHeader("Content-Length", chunkSize);
                
                console.log(`[STREAM START v4] ${requestId}: Headers set (206), piping stream for range ${start}-${end}`);
                
                // Handle stream errors
                stream.on('error', (error) => {
                  console.error(`[STREAM ERROR v4] ${requestId}: Stream error for ${storageKey} - error: ${error.message}, stack: ${error.stack}, filePath: ${filePath}, start: ${start}, end: ${end}, fileSize: ${fileSize}, headersSent: ${res.headersSent}`);
                  if (!res.headersSent) {
                    res.status(500).json({ 
                      error: 'Stream error', 
                      message: error.message,
                      details: `Failed to stream ${storageKey} from ${filePath}`
                    });
                  } else {
                    console.error(`[STREAM ERROR v4] ${requestId}: Headers already sent, cannot send error response`);
                  }
                });

                stream.on('end', () => {
                  console.log(`[STREAM COMPLETE v4] ${requestId}: Stream completed for ${storageKey}: bytes ${start}-${end}`);
                });

                stream.on('close', () => {
                  console.log(`[STREAM CLOSE v4] ${requestId}: Stream closed for ${storageKey}: bytes ${start}-${end}`);
                });
                
                return stream.pipe(res);
              } catch (streamError) {
                console.error(`[STREAM CREATE ERROR v4] ${requestId}: Failed to create read stream - error: ${streamError instanceof Error ? streamError.message : String(streamError)}, stack: ${streamError instanceof Error ? streamError.stack : undefined}, filePath: ${filePath}, start: ${start}, end: ${end}, fileSize: ${fileSize}, storageKey: ${storageKey}`);
                throw streamError;
              }
            } else {
              // Send entire file from disk
              logger.info(`[VIDEO STREAM] Streaming entire MP4 video: ${storageKey}, size: ${fileSize}`);
              const fs = await import("fs");
              
              try {
                const stream = fs.createReadStream(filePath);
                
                // Handle stream errors
                stream.on('error', (error) => {
                  logger.error(`[VIDEO STREAM ERROR] Stream error for ${storageKey}:`, {
                    error: error.message,
                    stack: error.stack,
                    filePath,
                    fileSize
                  });
                  if (!res.headersSent) {
                    res.status(500).json({ 
                      error: 'Stream error',
                      message: error.message,
                      details: `Failed to stream ${storageKey} from ${filePath}`
                    });
                  }
                });

                stream.on('end', () => {
                  logger.info(`[VIDEO STREAM] Stream completed for ${storageKey}`);
                });
                
                res.setHeader("Content-Length", fileSize);
                logger.info(`[VIDEO STREAM] Headers set, starting full file stream`);
                return stream.pipe(res);
              } catch (streamError) {
                logger.error(`[VIDEO STREAM ERROR] Failed to create read stream for full file:`, {
                  error: streamError instanceof Error ? streamError.message : String(streamError),
                  stack: streamError instanceof Error ? streamError.stack : undefined,
                  filePath,
                  fileSize,
                  storageKey
                });
                throw streamError;
              }
            }
          } catch (downloadError) {
            // Detailed error logging for cache/download failures
            console.error(`[VIDEO STREAM ERROR v4] ${requestId}: Cache operation failed for ${storageKey} - error: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}, stack: ${downloadError instanceof Error ? downloadError.stack : undefined}, errorType: ${downloadError instanceof Error ? downloadError.constructor.name : typeof downloadError}`);
            
            // If cache download fails (timeout in production), fall back to direct Object Storage streaming
            // This won't support seeking but will at least play the video
            console.log(`[VIDEO STREAM FALLBACK v4] ${requestId}: Direct streaming from Object Storage: ${storageKey}`);
            const stream = spartaObjectStorage.downloadAsStream(storageKey);
            
            stream.on('error', (error: Error) => {
              console.error(`[VIDEO STREAM ERROR v4] ${requestId}: Object Storage stream error for ${storageKey} - error: ${error.message}, stack: ${error.stack}`);
              if (!res.headersSent) {
                res.status(500).json({ 
                  error: 'Stream error', 
                  message: error.message,
                  details: 'Failed to stream from Object Storage'
                });
              }
            });

            stream.on('end', () => {
              console.log(`[VIDEO STREAM COMPLETE v4] ${requestId}: Object Storage stream completed for ${storageKey}`);
            });
            
            return stream.pipe(res);
          }
        }
      END OF OLD STREAMING CODE */

      // For non-videos, download and send directly
      const fileBuffer = await spartaObjectStorage.downloadFile(storageKey);
      res.setHeader("Content-Length", fileBuffer.length);
      console.log(`[FILE SERVED v4] ${requestId}: Served file: ${storageKey}, size: ${fileBuffer.length} bytes`);
      return res.send(fileBuffer);
    } catch (error) {
      console.error(`[ENDPOINT ERROR v4] ${requestId}: Error in direct-download endpoint - route: /api/object-storage/direct-download, storageKey: ${req.query.storageKey}, range: ${req.headers.range}, error: ${error instanceof Error ? error.message : String(error)}, stack: ${error instanceof Error ? error.stack : undefined}, errorType: ${error instanceof Error ? error.constructor.name : typeof error}, headersSent: ${res.headersSent}`);
      
      if (res.headersSent) {
        console.error(`[ENDPOINT ERROR v4] ${requestId}: Cannot send error response, headers already sent`);
        return;
      }
      
      return res.status(404).json({
        error: "File not found",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // HLS playlist endpoint - serves .m3u8 playlist files for HLS streaming
  app.get("/api/hls/:baseFilename/playlist.m3u8", async (req: Request, res: Response) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[HLS PLAYLIST] ${requestId}: Request for ${req.params.baseFilename}`);
    
    try {
      const { baseFilename } = req.params;
      const playlistKey = `shared/uploads/hls/${baseFilename}/${baseFilename}.m3u8`;
      
      console.log(`[HLS PLAYLIST] ${requestId}: Fetching playlist: ${playlistKey}`);
      
      const { spartaObjectStorage } = await import("./sparta-object-storage-final");
      
      try {
        const playlistBuffer = await spartaObjectStorage.downloadFile(playlistKey);
        
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
        res.setHeader("Access-Control-Allow-Origin", "*");
        
        console.log(`[HLS PLAYLIST] ${requestId}: Serving playlist (${playlistBuffer.length} bytes)`);
        return res.send(playlistBuffer);
      } catch (playlistError) {
        // HLS playlist doesn't exist - try on-demand conversion
        console.log(`[HLS PLAYLIST] ${requestId}: Playlist not found, attempting on-demand conversion`);
        
        // Try to find and convert the original video
        const originalVideoKey = `shared/uploads/${baseFilename}.MOV`;
        
        try {
          console.log(`[HLS PLAYLIST] ${requestId}: Fetching original video: ${originalVideoKey}`);
          const videoBuffer = await spartaObjectStorage.downloadFile(originalVideoKey);
          
          // Write video to temp file for conversion
          const tempVideoPath = `/tmp/${baseFilename}.MOV`;
          fs.writeFileSync(tempVideoPath, videoBuffer);
          
          try {
            console.log(`[HLS PLAYLIST] ${requestId}: Starting on-demand HLS conversion`);
            const { hlsConverter } = await import('./hls-converter');
            await hlsConverter.convertToHLS(tempVideoPath, baseFilename);
            
            console.log(`[HLS PLAYLIST] ${requestId}: On-demand conversion complete, fetching playlist`);
            
            // Clean up temp file
            fs.unlinkSync(tempVideoPath);
            
            // Now fetch the newly created playlist
            const newPlaylistBuffer = await spartaObjectStorage.downloadFile(playlistKey);
            
            res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
            res.setHeader("Cache-Control", "no-cache, must-revalidate");
            res.setHeader("Access-Control-Allow-Origin", "*");
            
            console.log(`[HLS PLAYLIST] ${requestId}: Serving converted playlist (${newPlaylistBuffer.length} bytes)`);
            return res.send(newPlaylistBuffer);
          } catch (conversionError) {
            console.error(`[HLS PLAYLIST] ${requestId}: On-demand conversion failed:`, conversionError);
            // Clean up temp file
            if (fs.existsSync(tempVideoPath)) {
              fs.unlinkSync(tempVideoPath);
            }
            throw conversionError;
          }
        } catch (videoError) {
          console.error(`[HLS PLAYLIST] ${requestId}: Original video not found or conversion failed:`, videoError);
          throw playlistError; // Return the original error
        }
      }
    } catch (error) {
      console.error(`[HLS PLAYLIST ERROR] ${requestId}: ${error instanceof Error ? error.message : String(error)}`);
      return res.status(404).json({
        error: "Playlist not found",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // HLS segment endpoint - serves .ts segment files for HLS streaming
  app.get("/api/hls/:baseFilename/:segmentFilename", async (req: Request, res: Response) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[HLS SEGMENT] ${requestId}: Request for ${req.params.baseFilename}/${req.params.segmentFilename}`);
    
    try {
      const { baseFilename, segmentFilename } = req.params;
      
      // Validate segment filename (must be .ts file)
      if (!segmentFilename.endsWith('.ts')) {
        return res.status(400).json({ error: "Invalid segment filename" });
      }
      
      const segmentKey = `shared/uploads/hls/${baseFilename}/${segmentFilename}`;
      
      console.log(`[HLS SEGMENT] ${requestId}: Fetching segment: ${segmentKey}`);
      
      const { spartaObjectStorage } = await import("./sparta-object-storage-final");
      const segmentBuffer = await spartaObjectStorage.downloadFile(segmentKey);
      
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Length", segmentBuffer.length);
      
      console.log(`[HLS SEGMENT] ${requestId}: Serving segment (${(segmentBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
      return res.send(segmentBuffer);
    } catch (error) {
      console.error(`[HLS SEGMENT ERROR] ${requestId}: ${error instanceof Error ? error.message : String(error)}`);
      return res.status(404).json({
        error: "Segment not found",
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
      const validRoles = ['isAdmin', 'isOrganizationAdmin', 'isTeamLead', 'isGroupAdmin'];
      if (!role || typeof value !== 'boolean' || !validRoles.includes(role)) {
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
        if (role === 'isAdmin' && !value && userId === req.user.id) {
          return res.status(403).json({ message: "You cannot remove your own Admin role" });
        }
      } else if (req.user.isOrganizationAdmin) {
        // Organization Admins cannot assign full Admin role
        if (role === 'isAdmin') {
          return res.status(403).json({ message: "Organization Admins cannot assign Admin roles" });
        }
        // Organization Admins cannot remove their own Organization Admin role
        if (role === 'isOrganizationAdmin' && !value && userId === req.user.id) {
          return res.status(403).json({ message: "You cannot remove your own Organization Admin role" });
        }
        if (targetUser.teamId) {
          const [team] = await db
            .select()
            .from(teams)
            .where(eq(teams.id, targetUser.teamId))
            .limit(1);
          if (team) {
            const [group] = await db
              .select()
              .from(groups)
              .where(eq(groups.id, team.groupId))
              .limit(1);
            if (!group || group.organizationId !== req.user.adminOrganizationId) {
              return res.status(403).json({ message: "Not authorized" });
            }
          }
        }
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

      // Build update payload
      const updatePayload: Record<string, any> = { [role]: value };

      // When setting Organization Admin, auto-set adminOrganizationId from user's team or from request body
      if (role === 'isOrganizationAdmin') {
        if (value) {
          if (req.body.adminOrganizationId) {
            updatePayload.adminOrganizationId = req.body.adminOrganizationId;
          } else if (targetUser.teamId) {
            const [team] = await db
              .select()
              .from(teams)
              .where(eq(teams.id, targetUser.teamId))
              .limit(1);
            if (team) {
              const [group] = await db
                .select()
                .from(groups)
                .where(eq(groups.id, team.groupId))
                .limit(1);
              if (group) {
                updatePayload.adminOrganizationId = group.organizationId;
              }
            }
          }
        } else {
          updatePayload.adminOrganizationId = null;
        }
      }

      // When setting Group Admin, auto-set adminGroupId from user's team or from request body
      if (role === 'isGroupAdmin') {
        if (value) {
          if (req.body.adminGroupId) {
            updatePayload.adminGroupId = req.body.adminGroupId;
          } else if (targetUser.teamId) {
            const [team] = await db
              .select()
              .from(teams)
              .where(eq(teams.id, targetUser.teamId))
              .limit(1);
            if (team) {
              updatePayload.adminGroupId = team.groupId;
            }
          }
        } else {
          updatePayload.adminGroupId = null;
        }
      }

      // Update the role
      const [updatedUser] = await db
        .update(users)
        .set(updatePayload)
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

      if (!req.user?.isAdmin && !req.user?.isOrganizationAdmin && !req.user?.isGroupAdmin && !req.user?.isTeamLead) {
        logger.warn(`[GENERAL USER UPDATE] Not authorized - user: ${req.user?.id}, isAdmin: ${req.user?.isAdmin}, isOrganizationAdmin: ${req.user?.isOrganizationAdmin}, isGroupAdmin: ${req.user?.isGroupAdmin}, isTeamLead: ${req.user?.isTeamLead}`);
        return res.status(403).json({ message: "Not authorized" });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID format" });
      }

      // For Team Leads, check that they're updating a user in their own team
      if (req.user?.isTeamLead && !req.user?.isAdmin && !req.user?.isOrganizationAdmin && !req.user?.isGroupAdmin) {
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
            return res.status(403).json({ message: "You can only assign users to teams in your division" });
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

      // If team is being changed, update join date and program start date
      if (req.body.teamId !== undefined) {
        if (req.body.teamId) {
          const now = new Date();
          updateData.teamJoinedAt = now;
          updateData.pendingOrganizationId = null;
          
          // Set programStartDate if not explicitly provided
          if (!updateData.programStartDate) {
            // Get team with its group info
            const [teamWithGroup] = await db
              .select({
                teamStartDate: teams.programStartDate,
                groupId: teams.groupId,
              })
              .from(teams)
              .where(eq(teams.id, req.body.teamId))
              .limit(1);

            // Validate team exists
            if (!teamWithGroup) {
              return res.status(400).json({ 
                message: `Team ${req.body.teamId} not found`
              });
            }

            let programStartDate: Date | null = null;

            // Priority 1: Team's start date
            if (teamWithGroup.teamStartDate) {
              programStartDate = new Date(teamWithGroup.teamStartDate);
              logger.info(`Setting user programStartDate from team start date: ${programStartDate.toISOString()}`);
            }
            // Priority 2: Group's start date
            else if (teamWithGroup.groupId) {
              const [group] = await db
                .select({ groupStartDate: groups.programStartDate })
                .from(groups)
                .where(eq(groups.id, teamWithGroup.groupId))
                .limit(1);

              if (group?.groupStartDate) {
                programStartDate = new Date(group.groupStartDate);
                logger.info(`Setting user programStartDate from group start date: ${programStartDate.toISOString()}`);
              }
            }

            // Priority 3: Current date if Monday, otherwise next Monday
            if (!programStartDate) {
              const today = new Date();
              const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
              
              if (dayOfWeek === 1) {
                // Today is Monday
                programStartDate = new Date(today);
                programStartDate.setHours(0, 0, 0, 0);
              } else {
                // Calculate next Monday
                const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
                programStartDate = new Date(today);
                programStartDate.setDate(today.getDate() + daysUntilMonday);
                programStartDate.setHours(0, 0, 0, 0);
              }
              logger.info(`Setting user programStartDate to computed Monday: ${programStartDate.toISOString()}`);
            }

            updateData.programStartDate = programStartDate;
          }
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

      // If user was assigned to a team, update their introductory_video posts to 'my_team' scope
      if (req.body.teamId && updatedUser.teamId) {
        try {
          const updatedPosts = await db
            .update(posts)
            .set({ postScope: 'my_team' })
            .where(
              and(
                eq(posts.userId, userId),
                eq(posts.type, 'introductory_video'),
                eq(posts.postScope, 'everyone')
              )
            )
            .returning();

          if (updatedPosts.length > 0) {
            logger.info(`[TEAM JOIN HOOK] Updated ${updatedPosts.length} introductory_video post(s) from user ${userId} to 'my_team' scope`);
          }
        } catch (scopeUpdateError) {
          // Non-fatal error - log it but don't block the user update
          logger.error(`[TEAM JOIN HOOK] Error updating introductory video scope for user ${userId}:`, scopeUpdateError);
        }
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

  // Delete user endpoint
  router.delete("/api/users/:userId", authenticate, async (req, res) => {
    try {
      // Authorization: Admin only
      if (!req.user?.isAdmin) {
        logger.warn(`[USER DELETE] Unauthorized attempt by user ${req.user?.id} to delete user ${req.params.userId}`);
        return res.status(403).json({ message: "Not authorized. Admin privileges required." });
      }

      // Validation: Parse and validate userId
      const userId = Number.parseInt(req.params.userId, 10);
      if (!Number.isFinite(userId) || userId <= 0) {
        logger.warn(`[USER DELETE] Invalid user ID format: ${req.params.userId}`);
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Check if user exists before attempting deletion
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!targetUser) {
        logger.warn(`[USER DELETE] User ${userId} not found`);
        return res.status(404).json({ message: "User not found" });
      }

      // Delete the user and all associated data
      logger.info(`[USER DELETE] Admin ${req.user.id} deleting user ${userId} (${targetUser.username})`);
      await storage.deleteUser(userId);

      logger.info(`[USER DELETE] Successfully deleted user ${userId} by admin ${req.user.id}`);
      res.status(200).json({ 
        message: "User deleted successfully",
        userId: userId
      });
    } catch (error) {
      logger.error(`[USER DELETE] Error deleting user ${req.params.userId}:`, error);
      res.status(500).json({
        message: "Failed to delete user",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get teams filtered by group ID
  router.get("/api/teams/by-group/:groupId", authenticate, async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      if (isNaN(groupId)) {
        return res.status(400).json({ message: "Invalid division ID" });
      }
      
      const groupTeams = await db
        .select()
        .from(teams)
        .where(eq(teams.groupId, groupId));
      
      res.json(groupTeams);
    } catch (error) {
      logger.error(`Error fetching teams for group ${req.params.groupId}:`, error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Self-service team join/create endpoint - allows users to create org/group/team and join as admin
  // This is intentionally open to any authenticated user to enable self-service team creation
  const selfServiceJoinSchema = z.object({
    organizationId: z.number().optional(),
    organizationName: z.string().min(1, "Organization name cannot be empty").max(100).optional(),
    groupId: z.number().optional(),
    groupName: z.string().min(1, "Division name cannot be empty").max(100).optional(),
    teamId: z.number().optional(),
    teamName: z.string().min(1, "Team name cannot be empty").max(100).optional(),
  });

  router.post("/api/self-service/join-team", authenticate, async (req, res) => {
    try {
      // Validate request body
      const parseResult = selfServiceJoinSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: parseResult.error.errors 
        });
      }

      const { 
        organizationId, 
        organizationName, 
        groupId, 
        groupName, 
        teamId, 
        teamName 
      } = parseResult.data;
      
      logger.info(`[SELF-SERVICE] User ${req.user.id} attempting to join/create team`, parseResult.data);
      
      // Check if user is already in a team (check this first)
      if (req.user.teamId) {
        return res.status(400).json({ message: "You are already assigned to a team" });
      }
      
      let finalOrgId = organizationId;
      let finalGroupId = groupId;
      let finalTeamId = teamId;
      let createdNewOrg = false;
      
      // If new organization name is provided, create it
      if (organizationName && !organizationId) {
        const newOrg = await storage.createOrganization({
          name: organizationName.trim(),
          description: "",
          status: 1
        });
        finalOrgId = newOrg.id;
        createdNewOrg = true;
        logger.info(`[SELF-SERVICE] Created new organization: ${newOrg.name} (ID: ${newOrg.id})`);
      }
      
      // Validate existing org if ID provided
      if (organizationId && !organizationName) {
        const [existingOrg] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        if (!existingOrg) {
          return res.status(400).json({ message: "Selected organization does not exist" });
        }
      }
      
      // If new group name is provided, create it; otherwise auto-create with org name
      if (groupName && !groupId) {
        if (!finalOrgId) {
          return res.status(400).json({ message: "Organization is required to create a division" });
        }
        const newGroup = await storage.createGroup({
          name: groupName.trim(),
          description: "",
          organizationId: finalOrgId,
          status: 1,
          competitive: false
        });
        finalGroupId = newGroup.id;
        logger.info(`[SELF-SERVICE] Created new group: ${newGroup.name} (ID: ${newGroup.id})`);
      } else if (!groupId && !groupName && finalOrgId) {
        // Auto-create a default division with the organization name
        const orgName = organizationName?.trim() || "";
        if (createdNewOrg && orgName) {
          // The default group was already created by storage.createOrganization(),
          // so find it by matching the org ID
          const existingGroups = await db.select().from(groups).where(eq(groups.organizationId, finalOrgId));
          if (existingGroups.length > 0) {
            finalGroupId = existingGroups[0].id;
            logger.info(`[SELF-SERVICE] Using auto-created default group (ID: ${finalGroupId}) for org ${finalOrgId}`);
          } else {
            const newGroup = await storage.createGroup({
              name: orgName,
              description: "",
              organizationId: finalOrgId,
              status: 1,
              competitive: false
            });
            finalGroupId = newGroup.id;
            logger.info(`[SELF-SERVICE] Created default group: ${newGroup.name} (ID: ${newGroup.id})`);
          }
        }
      }
      
      // Validate existing group if ID provided
      if (groupId && !groupName) {
        const [existingGroup] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
        if (!existingGroup) {
          return res.status(400).json({ message: "Selected division does not exist" });
        }
        // Verify group belongs to the selected organization
        if (finalOrgId && existingGroup.organizationId !== finalOrgId) {
          return res.status(400).json({ message: "Selected division does not belong to the selected organization" });
        }
      }
      
      // If new team name is provided, create it
      if (teamName && !teamId) {
        if (!finalGroupId) {
          return res.status(400).json({ message: "Division is required to create a team" });
        }
        const newTeam = await storage.createTeam({
          name: teamName.trim(),
          description: "",
          groupId: finalGroupId,
          maxSize: 9,
          status: 1
        });
        finalTeamId = newTeam.id;
        logger.info(`[SELF-SERVICE] Created new team: ${newTeam.name} (ID: ${newTeam.id})`);
      }
      
      // Validate existing team if ID provided
      if (teamId && !teamName) {
        const [existingTeam] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
        if (!existingTeam) {
          return res.status(400).json({ message: "Selected team does not exist" });
        }
        // Verify team belongs to the selected group
        if (finalGroupId && existingTeam.groupId !== finalGroupId) {
          return res.status(400).json({ message: "Selected team does not belong to the selected division" });
        }
      }
      
      // If no team selected or created
      if (!finalTeamId) {
        return res.status(400).json({ message: "A team must be selected or created" });
      }
      
      // Only make user a Team Lead if they created a new team (not if they selected an existing one)
      const isCreatingNewTeam = !!(teamName && !teamId);
      
      // Assign user to the team (as Team Lead only if creating new team)
      const now = new Date();

      // Calculate programStartDate using priority logic:
      // Priority 1: Team's start date
      // Priority 2: Group's start date
      // Priority 3: Current date if Monday, otherwise next Monday
      let computedProgramStartDate: Date | null = null;

      const [assignedTeam] = await db
        .select({
          teamStartDate: teams.programStartDate,
          groupId: teams.groupId,
        })
        .from(teams)
        .where(eq(teams.id, finalTeamId))
        .limit(1);

      if (assignedTeam?.teamStartDate) {
        computedProgramStartDate = new Date(assignedTeam.teamStartDate);
        logger.info(`[SELF-SERVICE] Setting programStartDate from team start date: ${computedProgramStartDate.toISOString()}`);
      } else if (assignedTeam?.groupId) {
        const [grp] = await db
          .select({ groupStartDate: groups.programStartDate })
          .from(groups)
          .where(eq(groups.id, assignedTeam.groupId))
          .limit(1);

        if (grp?.groupStartDate) {
          computedProgramStartDate = new Date(grp.groupStartDate);
          logger.info(`[SELF-SERVICE] Setting programStartDate from group start date: ${computedProgramStartDate.toISOString()}`);
        }
      }

      if (!computedProgramStartDate) {
        const today = new Date();
        const dayOfWeek = today.getDay();
        if (dayOfWeek === 1) {
          computedProgramStartDate = new Date(today);
          computedProgramStartDate.setHours(0, 0, 0, 0);
        } else {
          const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
          computedProgramStartDate = new Date(today);
          computedProgramStartDate.setDate(today.getDate() + daysUntilMonday);
          computedProgramStartDate.setHours(0, 0, 0, 0);
        }
        logger.info(`[SELF-SERVICE] Setting programStartDate to computed Monday: ${computedProgramStartDate.toISOString()}`);
      }

      const userUpdateData: any = { 
        teamId: finalTeamId,
        isTeamLead: isCreatingNewTeam,
        teamJoinedAt: now,
        programStartDate: computedProgramStartDate
      };

      if (createdNewOrg && finalOrgId) {
        userUpdateData.isOrganizationAdmin = true;
        userUpdateData.isTeamLead = false;
        userUpdateData.adminOrganizationId = finalOrgId;
        logger.info(`[SELF-SERVICE] Making user ${req.user.id} an Organization Admin for org ${finalOrgId} (not Team Lead)`);
      }

      await db
        .update(users)
        .set(userUpdateData)
        .where(eq(users.id, req.user.id));
      
      logger.info(`[SELF-SERVICE] User ${req.user.id} assigned to team ${finalTeamId}${isCreatingNewTeam ? ' as Team Lead' : ''}`);
      
      // Get updated user data
      const [updatedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);
      
      res.json({
        success: true,
        message: isCreatingNewTeam ? "Successfully joined team as Team Lead" : "Successfully joined team",
        user: updatedUser,
        teamId: finalTeamId
      });
    } catch (error) {
      logger.error(`[SELF-SERVICE] Error in join-team:`, error);
      res.status(500).json({
        message: "Failed to join team",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return httpServer;
};