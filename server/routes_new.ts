import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte, or, isNull, not, lt } from "drizzle-orm";
import * as fs from 'fs';
import * as path from 'path';
import {
  posts,
  notifications,
  users,
  teams,
  activities,
  workoutVideos,
  measurements,
  reactions,
  achievementTypes,
  userAchievements,
  insertTeamSchema,
  insertPostSchema,
  insertMeasurementSchema,
  insertNotificationSchema,
  insertVideoSchema,
  insertActivitySchema,
  insertUserSchema,
  insertAchievementTypeSchema,
  insertUserAchievementSchema,
  messages,
  insertMessageSchema
} from "@shared/schema";
import { setupAuth, authenticate } from "./auth";
import express, { Request, Response, NextFunction } from "express";
import { Server as HttpServer } from "http";
import mammoth from "mammoth";
import bcrypt from "bcryptjs";
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { logger } from './logger';
import { WebSocketServer, WebSocket } from 'ws';
import { spartaStorage } from './sparta-object-storage';
import { repairThumbnails } from './thumbnail-repair';
import { prayerRoutes } from './prayer-routes';
// Consolidated message routes have been moved to message-routes.ts
// Note: There are duplicate message handlers in this file around lines 3348 and 3979
// However, since the router.use(messageRouter) call appears first, these routes will be handled by the consolidated version
import { messageRouter } from './message-routes';

// Configure multer for file uploads - ensure directory matches SpartaObjectStorage
const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Make sure the directory exists
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multerStorage,
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB limit for video uploads
    fieldSize: 25 * 1024 * 1024 // 25MB per field
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

export const registerRoutes = async (app: express.Application): Promise<HttpServer> => {
  const router = express.Router();

  // Helper function to calculate program start date (first Monday after team join date)
  const calculateProgramStartDate = (teamJoinDate: Date): Date => {
    const joinDate = new Date(teamJoinDate);
    // Get the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const dayOfWeek = joinDate.getDay();
    
    // Calculate days until next Monday: if already Monday (1), use that date, otherwise find next Monday
    const daysUntilMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7;
    
    // Create program start date as the Monday on/after team join date
    const programStart = new Date(joinDate);
    programStart.setDate(joinDate.getDate() + daysUntilMonday);
    // Ensure we're at the start of the day
    programStart.setHours(0, 0, 0, 0);
    
    return programStart;
  };

  // Add request logging middleware
  router.use(requestLogger);
  
  // Register prayer routes
  router.use(prayerRoutes);
  
  // Register message routes
  router.use(messageRouter);

  // Configure document upload multer instance
  const docUpload = multer({
    storage: multerStorage,
    limits: { 
      fileSize: 10 * 1024 * 1024, // 10MB limit for document uploads
    },
    fileFilter: (req, file, cb) => {
      // Allow only Word documents
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.originalname.endsWith('.docx')) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    }
  });

  // Add CORS headers for all requests
  router.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    }
    if (req.method === 'OPTIONS') {
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
      const dateParam = req.query.date ? new Date(req.query.date as string) : new Date();

      // Convert server UTC time to user's local time
      const userDate = new Date(dateParam.getTime() - (tzOffset * 60000));

      // Create start and end of day in user's timezone
      const startOfDay = new Date(
        userDate.getFullYear(),
        userDate.getMonth(),
        userDate.getDate()
      );
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // For workout and memory verse posts, we need to check the week's total
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Set to Monday
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7); // Set to next Monday

      // Add timezone offset back to get UTC times for query
      const queryStartTime = new Date(startOfDay.getTime() + (tzOffset * 60000));
      const queryEndTime = new Date(endOfDay.getTime() + (tzOffset * 60000));

      // Query posts for the specified date by type
      const result = await db
        .select({
          type: posts.type,
          count: sql<number>`count(*)::integer`
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, req.user.id),
            gte(posts.createdAt, queryStartTime),
            lt(posts.createdAt, queryEndTime),
            isNull(posts.parentId), // Don't count comments
            sql`${posts.type} IN ('food', 'workout', 'scripture', 'memory_verse')` // Explicitly filter only these types
          )
        )
        .groupBy(posts.type);

      // Get workout posts for the entire week
      const workoutWeekResult = await db
        .select({
          count: sql<number>`count(*)::integer`,
          points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, req.user.id),
            eq(posts.type, 'workout'),
            gte(posts.createdAt, startOfWeek),
            lt(posts.createdAt, endOfWeek),
            isNull(posts.parentId)
          )
        );

      const workoutWeekCount = workoutWeekResult[0]?.count || 0;
      const workoutWeekPoints = workoutWeekResult[0]?.points || 0;

      // Get memory verse posts for the week
      const memoryVerseWeekResult = await db
        .select({
          count: sql<number>`count(*)::integer`
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, req.user.id),
            eq(posts.type, 'memory_verse'),
            gte(posts.createdAt, startOfWeek),
            lt(posts.createdAt, endOfWeek),
            isNull(posts.parentId)
          )
        );

      const memoryVerseWeekCount = memoryVerseWeekResult[0]?.count || 0;

      // Initialize counts with zeros
      const counts = {
        food: 0,
        workout: 0,
        scripture: 0,
        memory_verse: 0,
        miscellaneous: 0
      };

      // Update counts from query results
      result.forEach(row => {
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
        miscellaneous: Infinity // No limit for miscellaneous posts
      };

      // Calculate remaining posts for each type
      const remaining = {
        food: Math.max(0, maxPosts.food - counts.food),
        workout: Math.max(0, maxPosts.workout - counts.workout),
        scripture: Math.max(0, maxPosts.scripture - counts.scripture),
        memory_verse: Math.max(0, maxPosts.memory_verse - counts.memory_verse),
        miscellaneous: Infinity
      };

      // Calculate if user can post for each type
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

      const canPost = {
        food: counts.food < maxPosts.food && dayOfWeek !== 0, // No food posts on Sunday
        workout: counts.workout < maxPosts.workout && 
                workoutWeekPoints < 15, // Limit to 15 points per week (5 workouts)
        scripture: counts.scripture < maxPosts.scripture, // Scripture posts every day
        memory_verse: memoryVerseWeekCount === 0, // One memory verse per week
        miscellaneous: true // Always allow miscellaneous posts
      };

      res.json({
        counts,
        canPost,
        remaining,
        maxPosts,
        workoutWeekPoints,
        workoutWeekCount,
        memoryVerseWeekCount
      });
    } catch (error) {
      logger.error('Error getting post counts:', error);
      res.status(500).json({
        message: "Failed to get post counts",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add JSON content type header for all API routes
  router.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
  });

  // Add custom error handler for better JSON errors
  router.use('/api', (err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('API Error:', err);
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        message: err.message || "Internal server error",
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    } else {
      next(err);
    }
  });

  // Enhanced ping endpoint to verify API functionality and assist with WebSocket diagnostics
  router.get("/api/ping", (req, res) => {
    logger.info('Ping request received', { requestId: req.requestId });
    res.json({ 
      message: "pong",
      timestamp: new Date().toISOString(),
      serverTime: new Date().toString(),
      uptime: process.uptime(),
      memoryUsage: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
      }
    });
  });
  
  // WebSocket status endpoint to check real-time connections
  router.get("/api/ws-status", (req, res) => {
    // Count active WebSocket connections
    let totalConnections = 0;
    let activeUsers = 0;
    const userConnectionCounts = [];
    
    // Analyze the clients map
    clients.forEach((userClients, userId) => {
      const openConnections = Array.from(userClients).filter(
        ws => ws.readyState === WebSocket.OPEN
      ).length;
      
      if (openConnections > 0) {
        activeUsers++;
        totalConnections += openConnections;
        
        userConnectionCounts.push({
          userId,
          connections: openConnections
        });
      }
    });
    
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      websocket: {
        totalConnections,
        activeUsers,
        userDetails: userConnectionCounts
      },
      wss: {
        clients: wss.clients.size
      },
      serverInfo: {
        uptime: Math.floor(process.uptime()),
        startTime: new Date(Date.now() - (process.uptime() * 1000)).toISOString(),
        memoryUsage: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        }
      }
    });
  });
  
  // Add a test endpoint for triggering notification checks with manual time override
  router.get("/api/test-notification", async (req, res) => {
    // Set a longer timeout for this endpoint as it can be resource-intensive
    req.setTimeout(30000); // 30 seconds timeout
    
    try {
      // Get specified time or use current time
      const hour = parseInt(req.query.hour as string) || new Date().getHours();
      const minute = parseInt(req.query.minute as string) || new Date().getMinutes();
      
      logger.info(`Manual notification test triggered with time override: ${hour}:${minute}`);
      
      // Optional userId parameter to limit test to a specific user if needed
      // This helps reduce load for targeted testing
      const specificUserId = req.query.userId ? parseInt(req.query.userId as string) : null;
      
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
          totalNotifications: 0
        });
      }
      
      // Keep track of notifications sent
      const notificationsSent = [];
      
      // Process in batches if needed for large user counts
      // Using Promise.all with a limited batch size prevents server overload
      const BATCH_SIZE = 10;
      for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
        const userBatch = allUsers.slice(i, i + BATCH_SIZE);
        
        // Process users in parallel but in limited batches
        await Promise.all(userBatch.map(async (user) => {
          try {
            // Skip users without notification preferences
            if (!user.notificationTime) {
              logger.info(`Skipping user ${user.id} - no notification time preference set`);
              return;
            }
            
            // Parse user's notification time preference
            const [preferredHour, preferredMinute] = user.notificationTime.split(':').map(Number);
            
            // Log detailed time comparison for debugging
            logger.info(`Notification time check for user ${user.id}:`, {
              userId: user.id,
              currentTime: `${hour}:${minute}`,
              preferredTime: `${preferredHour}:${preferredMinute}`,
              notificationTime: user.notificationTime
            });
            
            // Check if current time matches user's preferred notification time (with 10-minute window)
            const isPreferredTimeWindow = 
              (hour === preferredHour && 
                (minute >= preferredMinute && minute < preferredMinute + 10)) ||
              // Handle edge case where preferred time is near the end of an hour
              (hour === preferredHour + 1 && 
                preferredMinute >= 50 && 
                minute < (preferredMinute + 10) % 60);
            
            if (isPreferredTimeWindow) {
              // Create a test notification with proper schema references
              const notification = {
                userId: user.id,
                title: "Test Notification",
                message: "This is a test notification sent at your preferred time.",
                read: false,
                createdAt: new Date(),
                type: "test",
                sound: "default"
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
                currentTime: `${hour}:${minute}`
              });
              
              // Send via WebSocket if user is connected
              const userClients = clients.get(user.id);
              if (userClients && userClients.size > 0) {
                broadcastNotification(user.id, {
                  id: createdNotification.id,
                  title: notification.title,
                  message: notification.message,
                  sound: notification.sound,
                  type: notification.type
                });
                
                logger.info(`Real-time notification sent to user ${user.id} via WebSocket`);
              } else {
                logger.info(`No active WebSocket connections for user ${user.id}`);
              }
            } else {
              logger.info(`User ${user.id}'s preferred time ${preferredHour}:${preferredMinute} doesn't match test time ${hour}:${minute}`);
            }
          } catch (userError) {
            logger.error(`Error processing test notification for user ${user.id}:`, userError instanceof Error ? userError : new Error(String(userError)));
          }
        }));
      }
      
      // Set proper content type header
      res.setHeader('Content-Type', 'application/json');
      
      // Return results - send before additional processing if needed
      res.json({
        message: `Test notification check completed for time ${hour}:${minute}`,
        notificationsSent,
        totalNotifications: notificationsSent.length
      });
    } catch (error) {
      logger.error('Error in test notification endpoint:', error);
      res.status(500).json({
        message: "Test notification failed",
        error: error instanceof Error ? error.message : "Unknown error"
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
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      });
      
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).send(JSON.stringify({ message: "Invalid post ID" }));
      }
      
      // Get the comments
      const comments = await storage.getPostComments(postId);
      
      // Explicitly validate the response
      const validComments = Array.isArray(comments) ? comments : [];
      
      // Log the response for debugging
      logger.info(`Sending comments for post ${postId}: ${validComments.length} comments`);
      
      // Double-check we're still sending as JSON (just in case)
      res.set('Content-Type', 'application/json');
      
      // Manually stringify the JSON to ensure it's not transformed in any way
      const jsonString = JSON.stringify(validComments);
      
      // Send the manual JSON response
      return res.send(jsonString);
    } catch (error) {
      logger.error('Error getting comments:', error);
      
      // Make sure we're still sending JSON on error
      res.set('Content-Type', 'application/json');
      
      // Return the error as a manually stringified JSON
      return res.status(500).send(JSON.stringify({ 
        message: "Failed to get comments",
        error: error instanceof Error ? error.message : "Unknown error"
      }));
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

      // Return success response
      return res.status(200).json({ 
        message: "Comment deleted successfully",
        id: commentId 
      });
    } catch (error) {
      logger.error("Error deleting comment:", error);
      return res.status(500).json({ 
        message: "Failed to delete comment",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Create a comment on a post
  router.post("/api/posts/comments", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.setHeader('Content-Type', 'application/json');

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Validate request body
      const { content, parentId, depth = 0 } = req.body;

      logger.info('Creating comment/reply with data:', {
        userId: req.user.id, 
        parentId, 
        contentLength: content ? content.length : 0,
        depth
      });

      if (!content || !parentId) {
        // Set JSON content type on error
        res.set('Content-Type', 'application/json');
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Make sure parentId is a valid number
      const parentIdNum = parseInt(parentId);
      if (isNaN(parentIdNum)) {
        // Set JSON content type on error
        res.set('Content-Type', 'application/json');
        return res.status(400).json({ message: "Invalid parent post ID" });
      }

      // Check if parent post exists
      try {
        const parentPost = await db.select().from(posts).where(eq(posts.id, parentIdNum)).limit(1);
        if (!parentPost || parentPost.length === 0) {
          logger.error(`Parent post with ID ${parentIdNum} not found.`);
          return res.status(404).json({ message: `Parent post with ID ${parentIdNum} not found` });
        }
        logger.info(`Found parent post: ID ${parentPost[0].id}, type: ${parentPost[0].type}`);
      } catch (error) {
        logger.error(`Error checking parent post ${parentIdNum}:`, error);
      }

      const comment = await storage.createComment({
        userId: req.user.id,
        content,
        parentId: parentIdNum,
        depth,
        type: 'comment', // Explicitly set type for comments
        points: 0 // Explicitly set 0 points for comments
      });

      // Return the created comment with author information
      const commentWithAuthor = {
        ...comment,
        author: {
          id: req.user.id,
          username: req.user.username,
          imageUrl: req.user.imageUrl
        }
      };

      // Make sure only JSON data is sent for the response
      res.set({
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Content-Type': 'application/json'
      });

      return res.status(201).json(commentWithAuthor);
    } catch (error) {
      logger.error('Error creating comment:', error);

      // Set JSON content type on error
      res.set('Content-Type', 'application/json');

      return res.status(500).json({ 
        message: "Failed to create comment",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Debug endpoint for safe post ID conversion
  router.get("/api/debug/safe-id/:id", async (req, res) => {
    try {
      const id = req.params.id;
      
      // Check for potentially problematic ID values (like JS timestamps)
      const originalId = parseInt(id);
      let safeId = originalId;
      
      // Handle potential integer overflow from JavaScript timestamps
      if (safeId && !isNaN(safeId) && safeId > 2147483647) {
        // PostgreSQL integer type range is -2,147,483,648 to 2,147,483,647
        // If we have a JavaScript timestamp (13 digits), convert it to a safe integer
        const idStr = String(safeId);
        if (idStr.length > 10) {
          safeId = parseInt(idStr.substring(0, 9));
        }
      }
      
      return res.json({
        originalId,
        safeId,
        isLarge: originalId > 2147483647,
        isSafe: safeId <= 2147483647,
        message: originalId === safeId 
          ? "ID is already within PostgreSQL integer range" 
          : "ID was converted to stay within PostgreSQL integer range"
      });
    } catch (error) {
      logger.error("Error in safe-id conversion debug endpoint:", error);
      return res.status(500).json({ error: "Failed to process ID" });
    }
  });

  // Debug endpoint for posts - unprotected for testing
  router.get("/api/debug/posts", async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.setHeader('Content-Type', 'application/json');

      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const postType = req.query.type as string;

      logger.info(`Debug posts request with: userId=${userId}, startDate=${startDate}, endDate=${endDate}, type=${postType}`);

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
      if (postType && postType !== 'all') {
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
            isAdmin: users.isAdmin
          }
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(posts.createdAt));

      const result = await query;

      logger.info(`Debug: Fetched ${result.length} posts`);
      res.json(result);
    } catch (error) {
      logger.error('Error in debug posts endpoint:', error);
      res.status(500).json({
        message: "Failed to fetch posts",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Endpoint to get aggregated weekly data
  router.get("/api/debug/posts/weekly-stats", authenticate, async (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');

      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      logger.info(`Weekly stats request with: userId=${userId}, startDate=${startDate}, endDate=${endDate}`);

      if (!userId || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing required parameters: userId, startDate, and endDate are required" });
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
        `
      );

      // Calculate the average weekly points
      let totalPoints = 0;
      const weeks = weeklyStats.length;

      if (weeks > 0) {
        weeklyStats.forEach(week => {
          totalPoints += parseInt(week.total_points);
        });
      }

      const averageWeeklyPoints = weeks > 0 ? Math.round(totalPoints / weeks) : 0;

      // Return both the weekly data and the average
      res.json({
        weeklyStats,
        averageWeeklyPoints,
        totalWeeks: weeks
      });
    } catch (error) {
      logger.error('Error in weekly stats endpoint:', error);
      res.status(500).json({
        message: "Failed to fetch weekly stats",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Endpoint to get post type distribution
  router.get("/api/debug/posts/type-distribution", authenticate, async (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json');

      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      logger.info(`Type distribution request with: userId=${userId}, startDate=${startDate}, endDate=${endDate}`);

      if (!userId || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing required parameters: userId, startDate, and endDate are required" });
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
        `
      );

      // Transform the data for frontend pie chart
      const chartData = typeDistribution.map(item => ({
        name: item.type.charAt(0).toUpperCase() + item.type.slice(1).replace('_', ' '),
        value: parseInt(item.count),
        points: parseInt(item.total_points)
      }));

      res.json(chartData);
    } catch (error) {
      logger.error('Error in type distribution endpoint:', error);
      res.status(500).json({
        message: "Failed to fetch type distribution",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Endpoint to trigger thumbnail repair
  router.get("/api/debug/repair-thumbnails", authenticate, async (req, res) => {
    try {
      // Only allow admin users to run this operation
      if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin access required" });
      }

      logger.info(`Thumbnail repair process initiated by user ${req.user.id}`);
      
      // Run the repair process asynchronously
      res.json({ 
        message: "Thumbnail repair process started",
        status: "running",
        startedAt: new Date().toISOString()
      });
      
      // Execute the thumbnail repair after sending the response
      repairThumbnails().then(() => {
        logger.info('Thumbnail repair process completed successfully');
      }).catch(err => {
        logger.error('Error in thumbnail repair process:', err);
      });
    } catch (error) {
      logger.error('Error initiating thumbnail repair:', error);
      res.status(500).json({
        message: "Failed to initiate thumbnail repair",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Debug endpoint to analyze comment structure
  router.get("/api/debug/comment-structure", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Get a sample post with its comments to analyze structure
      const postId = parseInt(req.query.postId as string) || 400;
      
      const post = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      const comments = await storage.getPostComments(postId);
      
      // Return debug information about the comment structure
      return res.json({
        post: post[0] || null,
        comments,
        commentCount: comments.length,
        topLevelComments: comments.filter(c => c.parentId === postId).length,
        replyComments: comments.filter(c => c.parentId !== postId).length,
        commentTypes: comments.reduce((acc, comment) => {
          if (!acc[comment.type]) acc[comment.type] = 0;
          acc[comment.type]++;
          return acc;
        }, {} as Record<string, number>),
        depthAnalysis: comments.reduce((acc, comment) => {
          const depth = comment.depth || 0;
          if (!acc[depth]) acc[depth] = 0;
          acc[depth]++;
          return acc;
        }, {} as Record<number, number>)
      });
    } catch (error) {
      logger.error('Error in debug endpoint:', error);
      return res.status(500).json({ 
        message: "Debug endpoint error",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Endpoint to check thumbnail status
  router.get("/api/debug/check-thumbnails", authenticate, async (req, res) => {
    try {
      // Only allow admin users to run this operation
      if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin access required" });
      }

      logger.info(`Thumbnail check process initiated by user ${req.user.id}`);
      
      // Import the thumbnail check script
      const { checkThumbnails } = await import('./thumbnail-check');
      
      // Run the check process asynchronously
      res.json({ 
        message: "Thumbnail check process started",
        status: "running",
        startedAt: new Date().toISOString()
      });
      
      // Execute the thumbnail check after sending the response
      checkThumbnails().then(() => {
        logger.info('Thumbnail check process completed successfully');
      }).catch(err => {
        logger.error('Error in thumbnail check process:', err);
      });
    } catch (error) {
      logger.error('Error initiating thumbnail check:', error);
      res.status(500).json({
        message: "Failed to initiate thumbnail check",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Helper endpoint to fix memory verse thumbnails for existing videos
  router.post("/api/memory-verse/fix-thumbnails", authenticate, async (req, res) => {
    try {
      // Only need to be logged in to repair your own memory verse videos
      if (!req.user) {
        return res.status(403).json({ message: "Authentication required" });
      }
      
      logger.info(`Fix memory verse thumbnails requested by user ${req.user.id}`);
      
      // Import the repair module
      const { repairMemoryVerseVideos } = await import('./memory-verse-repair');
      
      // Run the repair asynchronously
      res.json({
        message: "Memory verse thumbnail repair started",
        status: "processing"
      });
      
      // Process after sending the response
      repairMemoryVerseVideos()
        .then(() => {
          logger.info(`Memory verse thumbnail repair completed for user ${req.user.id}`);
        })
        .catch(error => {
          logger.error(`Memory verse thumbnail repair failed for user ${req.user.id}:`, error);
        });
        
    } catch (error) {
      logger.error('Error starting memory verse repair:', error);
      res.status(500).json({ message: "Failed to start memory verse repair" });
    }
  });
  
  // Endpoint to generate poster images for videos
  router.post("/api/video/generate-posters", authenticate, async (req, res) => {
    try {
      // Only need to be logged in to generate poster images
      if (!req.user) {
        return res.status(403).json({ message: "Authentication required" });
      }
      
      const { mediaUrl, postId } = req.body;
      
      logger.info(`Video poster generation requested for ${mediaUrl || 'all videos'} by user ${req.user.id}`, { postId });
      
      // Thumbnail generation is now handled during upload in sparta-object-storage.ts
      // No need for separate poster batch processing
      res.json({
        message: "Post created successfully",
        status: "complete",
        postId: postId || null
      });
        
    } catch (error) {
      logger.error('Error starting video poster generation:', error);
      res.status(500).json({ message: "Failed to start video poster generation" });
    }
  });

  // General endpoint to fix all thumbnails for uploaded files
  router.post("/api/fix-thumbnails", authenticate, async (req, res) => {
    try {
      // Only need to be logged in to repair thumbnails
      if (!req.user) {
        return res.status(403).json({ message: "Authentication required" });
      }
      
      logger.info(`Fix all thumbnails requested by user ${req.user.id}`);
      
      // Import the repair module
      const { repairThumbnails } = await import('./thumbnail-repair');
      
      // Run the repair asynchronously
      res.json({
        message: "Thumbnail repair started",
        status: "processing"
      });
      
      // Process after sending the response
      repairThumbnails()
        .then(() => {
          logger.info(`Thumbnail repair completed for user ${req.user.id}`);
        })
        .catch(error => {
          logger.error(`Thumbnail repair failed for user ${req.user.id}:`, error);
        });
        
    } catch (error) {
      logger.error('Error starting thumbnail repair:', error);
      res.status(500).json({ message: "Failed to start thumbnail repair" });
    }
  });
  
  // Admin endpoint to repair all memory verse videos
  router.get("/api/debug/repair-memory-verses", authenticate, async (req, res) => {
    try {
      // Only allow admin users to run this operation
      if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin access required" });
      }

      logger.info(`Memory verse video repair process initiated by user ${req.user.id}`);
      
      // Import the memory verse repair script
      const { repairMemoryVerseVideos } = await import('./memory-verse-repair');
      
      // Run the repair process asynchronously
      res.json({ 
        message: "Memory verse repair process started",
        status: "running",
        startedAt: new Date().toISOString()
      });
      
      // Execute the repair after sending the response
      repairMemoryVerseVideos().then(() => {
        logger.info('Memory verse repair process completed successfully');
      }).catch(err => {
        logger.error('Error in memory verse repair process:', err);
      });
    } catch (error) {
      logger.error('Error initiating memory verse repair:', error);
      res.status(500).json({
        message: "Failed to initiate memory verse repair",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Public route to check if a post exists and is accessible
  router.get("/api/check-post/:id", async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }
      
      // Get post from the database
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, postId));
        
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      // Also get author details
      const [author] = await db
        .select()
        .from(users)
        .where(eq(users.id, post.userId));
        
      // Check if the image exists if there's a mediaUrl
      let imageExists = false;
      let imagePath = '';
      let imagePathFixed = '';
      
      // Print full post object for debugging
      console.log('Post object:', JSON.stringify(post, null, 2));
      
      if (post.mediaUrl) {
        // Try current working directory
        imagePath = `.${post.mediaUrl}`; // Remove leading slash
        
        // Also try absolute path
        imagePathFixed = path.join(process.cwd(), post.mediaUrl.substring(1)); // Remove leading slash
        
        try {
          imageExists = fs.existsSync(imagePath) || fs.existsSync(imagePathFixed);
          console.log(`Image check: original path ${imagePath} exists: ${fs.existsSync(imagePath)}`);
          console.log(`Image check: fixed path ${imagePathFixed} exists: ${fs.existsSync(imagePathFixed)}`);
        } catch (err) {
          console.error(`Error checking if file exists at ${imagePath}:`, err);
          logger.error(`Error checking if file exists at ${imagePath}:`, err);
        }
      } else {
        console.log("No mediaUrl found in the post:", post);
      }
      
      // Check for thumbnail
      let thumbnailExists = false;
      let thumbnailPath = '';
      let thumbnailPathFixed = '';
      if (post.mediaUrl) {
        const filename = post.mediaUrl.split('/').pop() || '';
        
        // Check both formats - with and without thumb- prefix
        const newFormatThumbnailPath = `./uploads/thumbnails/thumb-${filename}`;
        const oldFormatThumbnailPath = `./uploads/thumbnails/${filename}`;
        
        // Also try absolute paths
        const newFormatPathFixed = path.join(process.cwd(), 'uploads', 'thumbnails', `thumb-${filename}`);
        const oldFormatPathFixed = path.join(process.cwd(), 'uploads', 'thumbnails', filename);
        
        // Check if the filename matches the old format pattern
        const isOldFormatImage = /^\d+-\d+-image\.\w+$/.test(filename);
        
        // For debugging purposes, set thumbnailPath to the actual path we're checking first
        thumbnailPath = isOldFormatImage ? oldFormatThumbnailPath : newFormatThumbnailPath;
        thumbnailPathFixed = isOldFormatImage ? oldFormatPathFixed : newFormatPathFixed;
        
        try {
          // Check both paths regardless of the format
          const newFormatExists = fs.existsSync(newFormatThumbnailPath) || fs.existsSync(newFormatPathFixed);
          const oldFormatExists = fs.existsSync(oldFormatThumbnailPath) || fs.existsSync(oldFormatPathFixed);
          
          thumbnailExists = newFormatExists || oldFormatExists;
          
          // Log the results for debugging
          console.log(`Thumbnail check: original path ${thumbnailPath} exists: ${fs.existsSync(thumbnailPath)}`);
          console.log(`Thumbnail check: fixed path ${thumbnailPathFixed} exists: ${fs.existsSync(thumbnailPathFixed)}`);
          
          if (isOldFormatImage) {
            console.log(`Old format image detected. Also checked new format: ${newFormatThumbnailPath} exists: ${fs.existsSync(newFormatThumbnailPath)}`);
          } else {
            console.log(`New format image detected. Also checked old format: ${oldFormatThumbnailPath} exists: ${fs.existsSync(oldFormatThumbnailPath)}`);
          }
        } catch (err) {
          console.error(`Error checking if thumbnail exists at ${thumbnailPath}:`, err);
          logger.error(`Error checking if thumbnail exists at ${thumbnailPath}:`, err);
        }
      }
      
      return res.json({
        post,
        author: author ? {
          id: author.id,
          username: author.username,
          imageUrl: author.imageUrl
        } : null,
        files: {
          imageExists,
          imagePath,
          imagePathFixed,
          thumbnailExists,
          thumbnailPath,
          thumbnailPathFixed
        }
      });
    } catch (error) {
      logger.error(`Error checking post ${req.params.id}:`, error);
      return res.status(500).json({ message: "Error checking post", error: String(error) });
    }
  });

  // Main GET endpoint for fetching posts
  router.get("/api/posts", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.setHeader('Content-Type', 'application/json');

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // Get filter parameters
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const postType = req.query.type as string;
      const excludeType = req.query.exclude as string;

      // Get current user's team, group, and organization info for scope filtering
      const [currentUser] = await db
        .select({
          teamId: users.teamId
        })
        .from(users)
        .where(eq(users.id, req.user.id));

      let userOrganizationId = null;
      let userGroupId = null;

      if (currentUser?.teamId) {
        const [team] = await db
          .select({
            groupId: teams.groupId
          })
          .from(teams)
          .where(eq(teams.id, currentUser.teamId));

        if (team?.groupId) {
          userGroupId = team.groupId;

          const [group] = await db
            .select({
              organizationId: groups.organizationId
            })
            .from(groups)
            .where(eq(groups.id, team.groupId));

          if (group?.organizationId) {
            userOrganizationId = group.organizationId;
          }
        }
      }

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
      if (postType && postType !== 'all') {
        conditions.push(eq(posts.type, postType));
      }
      
      // Add exclude filter if specified
      if (excludeType) {
        conditions.push(not(eq(posts.type, excludeType)));
      }

      // Add scope filtering - only show posts the user should see
      const scopeConditions = [
        eq(posts.postScope, 'everyone'), // Everyone can see posts with 'everyone' scope
      ];

      if (userOrganizationId) {
        scopeConditions.push(
          and(
            eq(posts.postScope, 'organization'),
            eq(posts.targetOrganizationId, userOrganizationId)
          )
        );
      }

      if (userGroupId) {
        scopeConditions.push(
          and(
            eq(posts.postScope, 'group'),
            eq(posts.targetGroupId, userGroupId)
          )
        );
      }

      if (currentUser?.teamId) {
        scopeConditions.push(
          and(
            eq(posts.postScope, 'team'),
            eq(posts.targetTeamId, currentUser.teamId)
          )
        );
        
        // For 'my_team' scope, show posts from users in the same team
        scopeConditions.push(
          and(
            eq(posts.postScope, 'my_team'),
            sql`${posts.userId} IN (SELECT id FROM users WHERE team_id = ${currentUser.teamId})`
          )
        );
      } else {
        // If user has no team, they can only see 'everyone' posts
        // The my_team condition will naturally be excluded
      }

      conditions.push(or(...scopeConditions));

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
            isAdmin: users.isAdmin
          }
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

      logger.info(`Fetched ${result.length} posts with filters: userId=${userId}, startDate=${startDate}, endDate=${endDate}, type=${postType}`);
      res.json(result);
    } catch (error) {
      logger.error('Error fetching posts:', error);
      res.status(500).json({
        message: "Failed to fetch posts",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get single post by ID - this must be placed after any more specific routes like /api/posts/comments
  router.get("/api/posts/:id", authenticate, async (req, res) => {
    try {
      // Force JSON content type header immediately to prevent any potential HTML response
      res.set({
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      });
      
      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).send(JSON.stringify({ message: "Invalid post ID" }));
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
            isAdmin: users.isAdmin
          }
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.id, postId))
        .limit(1);
      
      if (!result || result.length === 0) {
        return res.status(404).send(JSON.stringify({ message: "Post not found" }));
      }
      
      const post = result[0];
      
      // Log the response for debugging
      logger.info(`Sending post ${postId}`);
      
      // Double-check we're still sending as JSON (just in case)
      res.set('Content-Type', 'application/json');
      
      // Manually stringify the JSON to ensure it's not transformed in any way
      const jsonString = JSON.stringify(post);
      
      // Send the manual JSON response
      return res.send(jsonString);
    } catch (error) {
      logger.error('Error getting post:', error);
      
      // Make sure we're still sending JSON on error
      res.set('Content-Type', 'application/json');
      
      // Return the error as a manually stringified JSON
      return res.status(500).send(JSON.stringify({ 
        message: "Failed to get post",
        error: error instanceof Error ? error.message : "Unknown error"
      }));
    }
  });
  
  // Get reactions for a post
  router.get("/api/posts/:postId/reactions", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.set({
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      });
      
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }
      
      const reactions = await storage.getReactionsByPost(postId);
      return res.json(reactions);
    } catch (error) {
      logger.error('Error getting reactions:', error);
      // Ensure JSON content type on error
      res.set('Content-Type', 'application/json');
      return res.status(500).json({
        message: "Failed to get reactions",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Add a reaction to a post
  router.post("/api/posts/:postId/reactions", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.set({
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
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
        r => r.userId === req.user!.id && r.type === type
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
        type
      });
      
      return res.status(201).json(reaction);
    } catch (error) {
      logger.error('Error creating reaction:', error);
      // Ensure JSON content type on error
      res.set('Content-Type', 'application/json');
      return res.status(500).json({
        message: "Failed to create reaction",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Delete a reaction
  router.delete("/api/posts/:postId/reactions/:type", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.set({
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
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
      logger.error('Error deleting reaction:', error);
      // Ensure JSON content type on error
      res.set('Content-Type', 'application/json');
      return res.status(500).json({
        message: "Failed to delete reaction",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Teams endpoints
  router.get("/api/teams", authenticate, async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error) {
      logger.error('Error fetching teams:', error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Add the missing POST endpoint for creating teams
  router.post("/api/teams", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      logger.info('Creating team with data:', req.body);

      const parsedData = insertTeamSchema.safeParse(req.body);
      if (!parsedData.success) {
        logger.error('Validation errors:', parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid team data",
          errors: parsedData.error.errors
        });
      }

      const team = await storage.createTeam(parsedData.data);
      res.status(201).json(team);
    } catch (error) {
      logger.error('Error creating team:', error);
      res.status(500).json({
        message: "Failed to create team",
        error: error instanceof Error ? error.message : "Unknown error"
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
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Activities endpoints
  // Add endpoint to handle document upload for activities
  router.post("/api/activities/upload-doc", authenticate, docUpload.single('document'), async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No document uploaded" });
      }

      const filePath = req.file.path;
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Uploaded file not found" });
      }

      // Process the document with mammoth
      try {
        // Convert to HTML instead of raw text to preserve formatting
        const result = await mammoth.convertToHtml({ path: filePath });
        const content = result.value; // The HTML content
        const messages = result.messages; // Any messages during conversion

        if (messages.length > 0) {
          logger.info('Mammoth conversion messages:', { messages });
        }

        logger.info(`Successfully extracted HTML from document: ${req.file.originalname}`);
        
        // Return the processed content
        return res.json({ 
          message: "Document processed successfully",
          content,
          filename: req.file.originalname
        });
      } catch (mammothError) {
        logger.error("Error processing document with mammoth:", mammothError);
        return res.status(500).json({ 
          message: "Failed to process document",
          error: mammothError instanceof Error ? mammothError.message : "Unknown error"
        });
      }
    } catch (error) {
      logger.error("Error handling document upload:", error);
      return res.status(500).json({ 
        message: "Error processing document upload",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      // Clean up the temporary file if it exists
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try {
          // fs.unlinkSync(req.file.path);
          // Leave file in place for debugging
          logger.info(`Leaving uploaded document for debugging: ${req.file.path}`);
        } catch (cleanupError) {
          logger.warn("Error cleaning up temporary document file:", cleanupError);
        }
      }
    }
  });

  router.get("/api/activities", authenticate, async (req, res) => {
    try {
      const { week, day } = req.query;
      const activities = await storage.getActivities(
        week ? parseInt(week as string) : undefined,
        day ? parseInt(day as string) : undefined
      );
      logger.info('Retrieved activities:', JSON.stringify(activities, null, 2));
      res.json(activities);
    } catch (error) {
      logger.error('Error fetching activities:', error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  router.post("/api/activities", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      logger.info('Creating activity with data:', JSON.stringify(req.body, null, 2));

      const parsedData = insertActivitySchema.safeParse(req.body);
      if (!parsedData.success) {
        logger.error('Validation errors:', parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid activity data",
          errors: parsedData.error.errors
        });
      }

      logger.info('Parsed activity data:', JSON.stringify(parsedData.data, null, 2));

      try {
        const activity = await storage.createActivity(parsedData.data);
        res.status(201).json(activity);
      } catch (dbError) {
        logger.error('Database error:', dbError);
        res.status(500).json({
          message: "Failed to create activity in database",
          error: dbError instanceof Error ? dbError.message : "Unknown error"
        });
      }
    } catch (error) {
      logger.error('Error creating activity:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to create activity",
        error: error instanceof Error ? error.stack : undefined
      });
    }
  });

  router.put("/api/activities/:id", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      logger.info('Updating activity with data:', JSON.stringify(req.body, null, 2));

      const parsedData = insertActivitySchema.safeParse(req.body);
      if (!parsedData.success) {
        logger.error('Validation errors:', parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid activity data",
          errors: parsedData.error.errors
        });
      }

      const [activity] = await db
        .update(activities)
        .set(parsedData.data)
        .where(eq(activities.id, parseInt(req.params.id)))
        .returning();
      res.json(activity);
    } catch (error) {
      logger.error('Error updating activity:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update activity" });
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
      logger.error('Error deleting activity:', error);
      res.status(500).json({
        message: "Failed to delete activity",
        error: error instanceof Error ? error.message : undefined
      });
    }
  });

  router.get("/api/users", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      logger.error('Error fetching users:', error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update the post creation endpoint to ensure correct point assignment
  // Get memory verse videos for the current user
  router.get("/api/memory-verse-videos", authenticate, async (req, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Fetch memory verse posts with videos
      const memoryVersePosts = await db
        .select({
          id: posts.id,
          content: posts.content,
          mediaUrl: posts.mediaUrl,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            eq(posts.type, 'memory_verse'),
            not(isNull(posts.mediaUrl)),
            isNull(posts.parentId) // Don't include comments
          )
        )
        .orderBy(desc(posts.createdAt));
      
      res.json(memoryVersePosts);
    } catch (error) {
      logger.error("Error fetching memory verse videos:", error);
      res.status(500).json({ message: "Error fetching memory verse videos" });
    }
  });

  router.post("/api/posts", authenticate, upload.single('image'), async (req, res) => {
    // Set content type early to prevent browser confusion
    res.set({
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff'
    });
    
    // Initialize isVideo variable to be used throughout the route handler
    let isVideo = false;
    
    console.log("POST /api/posts - Request received", {
      hasFile: !!req.file,
      fileDetails: req.file ? {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        path: req.file.path,
        destination: req.file.destination,
        size: req.file.size
      } : 'No file uploaded',
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body)
    });
    
    // Check if this is a memory verse post based on the parsed data
    let isMemoryVersePost = false;
    if (req.body.data) {
      try {
        const parsedData = JSON.parse(req.body.data);
        isMemoryVersePost = parsedData.type === 'memory_verse';
        if (isMemoryVersePost) {
          console.log("Memory verse post detected:", {
            originalname: req.file?.originalname || 'No file',
            mimetype: req.file?.mimetype || 'No mimetype',
            fileSize: req.file?.size || 0,
            path: req.file?.path || 'No path'
          });
        }
      } catch (e) {
        // Ignore parsing errors here, it will be handled later
      }
    }
    
    // Extra logging for debugging
    if (req.file) {
      try {
        const stats = fs.statSync(req.file.path);
        console.log("File stats:", {
          exists: fs.existsSync(req.file.path),
          size: stats.size,
          isFile: stats.isFile(),
          path: req.file.path,
          absolutePath: path.resolve(req.file.path)
        });
      } catch (statError) {
        console.error("Error checking file:", statError);
      }
    }
    
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      let postData = req.body;
      if (typeof postData.data === 'string') {
        try {
          const rawData = postData.data;
          console.log("RAW JSON STRING (first 500 chars):", rawData.substring(0, 500));
          postData = JSON.parse(postData.data);
          
          console.log("AFTER JSON.PARSE - Full object keys:", Object.keys(postData));
          console.log("AFTER JSON.PARSE - postScope value:", postData.postScope);
          console.log("AFTER JSON.PARSE - targetTeamId value:", postData.targetTeamId);
          
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
        if (req.file) {
          try {
            // Use SpartaObjectStorage for file handling
            const { spartaStorage } = await import('./sparta-object-storage');
            
            // Verify the file exists before proceeding
            let filePath = req.file.path;
            
            // Verify the file exists at the path reported by multer
            if (!fs.existsSync(filePath)) {
              logger.warn(`Comment file not found at the reported path: ${filePath}, will search for it`);
              
              // Try to locate the file using alternative paths
              const fileName = path.basename(filePath);
              const possiblePaths = [
                filePath,
                path.join(process.cwd(), 'uploads', fileName),
                path.join(process.cwd(), 'uploads', path.basename(req.file.originalname)),
                path.join(path.dirname(filePath), path.basename(req.file.originalname)),
                path.join('/tmp', fileName)
              ];
              
              let foundPath = null;
              for (const altPath of possiblePaths) {
                logger.info(`Checking alternative path: ${altPath}`);
                if (fs.existsSync(altPath)) {
                  logger.info(`Found file at alternative path: ${altPath}`);
                  foundPath = altPath;
                  break;
                }
              }
              
              if (foundPath) {
                filePath = foundPath;
                logger.info(`Using alternative file path: ${filePath}`);
              } else {
                logger.error(`Could not find file at any alternative path for: ${filePath}`);
              }
            }
            
            // Proceed if the file exists (either at original or alternative path)
            if (fs.existsSync(filePath)) {
              const originalFilename = req.file.originalname.toLowerCase();
              
              // Check if this is a video upload based on multiple indicators
              const isVideoMimetype = req.file.mimetype.startsWith('video/');
              const isVideoExtension = originalFilename.endsWith('.mov') || 
                                     originalFilename.endsWith('.mp4') ||
                                     originalFilename.endsWith('.webm') ||
                                     originalFilename.endsWith('.avi') ||
                                     originalFilename.endsWith('.mkv');
              
              // Final video determination
              const isVideo = isVideoMimetype || isVideoExtension;
              
              // Store the file using SpartaObjectStorage
              console.log(`Processing comment media file:`, {
                originalFilename: req.file.originalname,
                mimetype: req.file.mimetype,
                isVideo: isVideo,
                fileSize: req.file.size
              });
              
              logger.info(`Processing comment media file: ${req.file.originalname}, type: ${req.file.mimetype}, isVideo: ${isVideo}, size: ${req.file.size}`);
              
              const fileInfo = await spartaStorage.storeFileFromBuffer(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                isVideo
              );
              
              commentMediaUrl = fileInfo.url;
              console.log(`Stored comment media file:`, { url: commentMediaUrl });
            }
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
      } else if (req.file) {
        try {
          // Use SpartaObjectStorage for file handling
          const { spartaStorage } = await import('./sparta-object-storage');
          
          // Verify the file exists before proceeding
          let filePath = req.file.path;
          
          // Verify the file exists at the path reported by multer
          if (!fs.existsSync(filePath)) {
            logger.warn(`File not found at the reported path: ${filePath}, will search for it`);
            
            // Try to locate the file using alternative paths
            const fileName = path.basename(filePath);
            const possiblePaths = [
              filePath,
              path.join(process.cwd(), 'uploads', fileName),
              path.join(process.cwd(), 'uploads', path.basename(req.file.originalname)),
              path.join(path.dirname(filePath), path.basename(req.file.originalname)),
              path.join('/tmp', fileName)
            ];
            
            let foundPath = null;
            for (const altPath of possiblePaths) {
              logger.info(`Checking alternative path: ${altPath}`);
              if (fs.existsSync(altPath)) {
                logger.info(`Found file at alternative path: ${altPath}`);
                foundPath = altPath;
                break;
              }
            }
            
            if (foundPath) {
              filePath = foundPath;
              logger.info(`Using alternative file path: ${filePath}`);
            } else {
              logger.error(`Could not find file at any alternative path for: ${filePath}`);
            }
          }
          
          // Proceed if the file exists (either at original or alternative path)
          if (fs.existsSync(filePath)) {
            // Handle video files differently - check both mimetype and file extension
            const originalFilename = req.file.originalname.toLowerCase();
            
            // Simplified detection for memory verse posts - rely only on the post type
            const isMemoryVersePost = postData.type === 'memory_verse';
            
            // Handle specialized types
            const isMiscellaneousPost = postData.type === 'miscellaneous';
            
            console.log("Post type detection:", {
              isMemoryVersePost,
              isMiscellaneousPost,
              originalName: req.file.originalname
            });
            
            // Check if this is a video upload based on multiple indicators
            const isVideoMimetype = req.file.mimetype.startsWith('video/');
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
                                        (req.file && (isVideoMimetype || isVideoExtension)));
                                        
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
              mimetype: req.file.mimetype,
              originalFilename: req.file.originalname,
              selectedMediaType: req.body.selected_media_type,
              isVideoFlag: req.body.is_video
            });
            
            // We no longer need to create a separate file with prefix here.
            // SpartaObjectStorage will handle proper file placement based on post type.
            // This removes the creation of a redundant third file.
            console.log("Skipping redundant file creation - SpartaObjectStorage will handle file organization");
            
            console.log(`Processing media file:`, {
              originalFilename: req.file.originalname,
              mimetype: req.file.mimetype,
              isVideo: isVideo,
              isMemoryVerse: isMemoryVersePost,
              fileSize: req.file.size,
              path: req.file.path,
              postType: postData.type || 'unknown'
            });
            
            logger.info(`Processing media file: ${req.file.originalname}, type: ${req.file.mimetype}, isVideo: ${isVideo}, size: ${req.file.size}`);
            
            // Store the file using SpartaObjectStorage (used for both images and videos)
            // For memory verse posts, if mimetype doesn't specify video, force it to video/mp4
            let effectiveMimeType = req.file.mimetype;
            
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
              original: req.file.mimetype,
              effective: effectiveMimeType,
              isMemoryVerse: isMemoryVersePost,
              isMiscellaneous: isMiscellaneousPost,
              isVideo: isVideo,
              wasOverridden: effectiveMimeType !== req.file.mimetype,
              fileSize: req.file.size,
              formDataKeys: Object.keys(req.body || {})
            });
              
            const fileInfo = await spartaStorage.storeFileFromBuffer(
              req.file.buffer,
              req.file.originalname,
              effectiveMimeType, // Use potentially corrected mimetype
              isVideo // Pass flag for video handling
            );
            
            mediaUrl = fileInfo.url;
            mediaProcessed = true;
            
            // Verify the stored file exists in the uploads directory
            const storedFilePath = path.join(process.cwd(), fileInfo.url);
            let fileExists = fs.existsSync(storedFilePath);
            
            if (!fileExists) {
              logger.error(`Stored file not found at expected path: ${storedFilePath}. Original stored at ${fileInfo.path}`);
              
              // Try to find the file in different paths
              const alternativePaths = [
                fileInfo.path,
                path.join(process.cwd(), 'uploads', path.basename(fileInfo.url)),
                path.join(process.cwd(), fileInfo.url),
                path.join(process.cwd(), '..' + fileInfo.url),
                path.join(process.cwd(), '..', 'uploads', path.basename(fileInfo.url))
              ];
              
              let sourceFile = null;
              
              // Check each alternative path
              for (const altPath of alternativePaths) {
                if (fs.existsSync(altPath)) {
                  logger.info(`Found file at alternative path: ${altPath}`);
                  sourceFile = altPath;
                  break;
                }
              }
              
              // Copy file to correct location if found
              if (sourceFile) {
                const newDir = path.dirname(storedFilePath);
                if (!fs.existsSync(newDir)) {
                  fs.mkdirSync(newDir, { recursive: true });
                }
                
                try {
                  fs.copyFileSync(sourceFile, storedFilePath);
                  logger.info(`Copied file from ${sourceFile} to correct location ${storedFilePath}`);
                  fileExists = true;
                } catch (copyErr) {
                  logger.error(`Failed to copy file: ${copyErr instanceof Error ? copyErr.message : 'Unknown error'}`);
                }
              } else {
                logger.error(`Could not find file in any alternative locations`);
              }
            }
            
            if (isVideo) {
              logger.info(`Video file stored successfully at ${fileInfo.path} using SpartaObjectStorage`);
              logger.info(`Video URL: ${mediaUrl}, should be available at: ${storedFilePath}`);
            } else {
              logger.info(`Image file stored successfully at ${fileInfo.path} using SpartaObjectStorage`);
              logger.info(`Thumbnail URL: ${fileInfo.thumbnailUrl}`);
            }
            
            // We can remove the original uploaded file as SpartaObjectStorage has copied it
            try {
              fs.unlinkSync(filePath);
              logger.info(`Removed original temporary file at ${filePath}`);
            } catch (unlinkErr) {
              logger.warn(`Could not remove temporary file: ${unlinkErr instanceof Error ? unlinkErr.message : 'Unknown error'}`);
            }
          } else {
            logger.error(`Media file not found at expected path: ${filePath}`);
            // Don't use any fallback image
            mediaUrl = null;
            logger.info(`No media found for post type: ${postData.type}`);
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

      // Extract and validate scope information
      const postScope = postData.postScope || 'my_team';
      const targetOrganizationId = postData.targetOrganizationId || null;
      const targetGroupId = postData.targetGroupId || null;
      const targetTeamId = postData.targetTeamId || null;

      console.log('=================== SERVER RECEIVED DATA ===================');
      console.log('Complete postData object:', JSON.stringify(postData, null, 2));
      console.log('Extracted scope values:');
      console.log('  postScope:', postScope);
      console.log('  targetOrganizationId:', targetOrganizationId);
      console.log('  targetGroupId:', targetGroupId);
      console.log('  targetTeamId:', targetTeamId);
      console.log('============================================================');

      // Get user's details for permission validation
      const [currentUser] = await db
        .select({
          isAdmin: users.isAdmin,
          isGroupAdmin: users.isGroupAdmin,
          adminGroupId: users.adminGroupId,
          teamId: users.teamId
        })
        .from(users)
        .where(eq(users.id, req.user.id));

      // Validate user has permission to post with the selected scope
      if (postScope === 'everyone' && !currentUser.isAdmin) {
        return res.status(403).json({ message: "Only admins can post to everyone" });
      }
      
      if (postScope === 'organization') {
        if (!currentUser.isAdmin) {
          return res.status(403).json({ message: "Only admins can post to an organization" });
        }
        if (!targetOrganizationId) {
          return res.status(400).json({ message: "Organization ID is required for organization scope" });
        }
      }
      
      if (postScope === 'group') {
        if (!currentUser.isAdmin && !currentUser.isGroupAdmin) {
          return res.status(403).json({ message: "Only admins and group admins can post to a group" });
        }
        if (!targetGroupId) {
          return res.status(400).json({ message: "Group ID is required for group scope" });
        }
        // Group admins can only post to their own group
        if (currentUser.isGroupAdmin && targetGroupId !== currentUser.adminGroupId) {
          return res.status(403).json({ message: "Group admins can only post to their own group" });
        }
      }
      
      if (postScope === 'team') {
        if (!currentUser.isAdmin && !currentUser.isGroupAdmin) {
          return res.status(403).json({ message: "Only admins and group admins can post to a team" });
        }
        if (!targetTeamId) {
          return res.status(400).json({ message: "Team ID is required for team scope" });
        }
        // Group admins can only post to teams in their group
        if (currentUser.isGroupAdmin) {
          const [team] = await db
            .select({ groupId: teams.groupId })
            .from(teams)
            .where(eq(teams.id, targetTeamId));
          
          if (!team || team.groupId !== currentUser.adminGroupId) {
            return res.status(403).json({ message: "Group admins can only post to teams in their group" });
          }
        }
      }

      console.log("🔴🔴🔴 DATABASE INSERT VALUES:");
      console.log("  postScope:", postScope);
      console.log("  targetOrganizationId:", targetOrganizationId);
      console.log("  targetGroupId:", targetGroupId);
      console.log("  targetTeamId:", targetTeamId);
      console.log("  typeof targetTeamId:", typeof targetTeamId);

      const post = await db
        .insert(posts)
        .values({
          userId: req.user.id,
          type: postData.type,
          content: postData.content?.trim() || '',
          mediaUrl: mediaUrl,
          is_video: isVideo || false, // Set is_video flag based on our detection logic
          points: points,
          postScope: postScope,
          targetOrganizationId: targetOrganizationId,
          targetGroupId: targetGroupId,
          targetTeamId: targetTeamId,
          createdAt: postData.createdAt ? new Date(postData.createdAt) : new Date()
        })
        .returning()
        .then(posts => posts[0]);
      
      console.log("🟢🟢🟢 CREATED POST:");
      console.log("  post.postScope:", post.postScope);
      console.log("  post.targetTeamId:", post.targetTeamId);

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

  // Add this endpoint before the return httpServer statement with improved error handling
  router.patch("/api/posts/:id", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.setHeader('Content-Type', 'application/json');

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the post ID as a number
      const postIdStr = req.params.id;
      const postId = parseInt(postIdStr);
      
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID format" });
      }

      // Get the post to check ownership
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if the user is the owner of the post
      if (post.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to update this post" });
      }

      // Get the content from the request body
      const { content } = req.body;
      
      if (!content || content.trim() === '') {
        return res.status(400).json({ message: "Content cannot be empty" });
      }

      // Update only the content field
      const [updatedPost] = await db
        .update(posts)
        .set({ content: content.trim() })
        .where(eq(posts.id, postId))
        .returning();

      return res.status(200).json(updatedPost);
    } catch (error) {
      logger.error("Error updating post:", error);
      return res.status(500).json({ 
        message: "Failed to update post",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  router.delete("/api/posts/:id", authenticate, async (req, res) => {
    try {
      // Set content type early to prevent browser confusion
      res.setHeader('Content-Type', 'application/json');

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the post ID as a string to handle timestamp-based IDs
      const postIdStr = req.params.id;

      // Log the raw post ID for debugging
      console.log(`Raw post ID from request: ${postIdStr}`);
      logger.info(`Raw post ID from request: ${postIdStr}`);

      let post;
      let postId;

      // First, try direct numeric ID lookup (for posts created with regular IDs)
      if (/^\d+$/.test(postIdStr) && postIdStr.length < 10) {
        // Probably a regular numeric ID
        postId = parseInt(postIdStr);
        
        // Get the post to check ownership
        [post] = await db
          .select()
          .from(posts)
          .where(eq(posts.id, postId));
      }

      // If not found or ID looks like a timestamp (longer numeric string), try to find by timestamp ID
      if (!post && /^\d+$/.test(postIdStr) && postIdStr.length > 10) {
        // Timestamp-based ID, likely a newer style post
        console.log(`Handling timestamp-based ID: ${postIdStr}`);
        
        // First try exact match in case it's stored directly
        [post] = await db
          .select()
          .from(posts)
          .where(sql`CAST(id AS TEXT) = ${postIdStr}`);
        
        if (post) {
          postId = post.id;
          console.log(`Found post with exact timestamp ID: ${postId}`);
        } else {
          // Try to find by created timestamp proximity
          const approxTimestamp = parseInt(postIdStr);
          console.log(`Trying to find post with approximate timestamp: ${approxTimestamp}`);
          
          // SQL query to find a post created around the same time as the timestamp
          // Look for posts within 10 seconds of the timestamp
          // Note: Database column is "created_at" not "createdAt"
          const postsAroundTime = await db
            .select()
            .from(posts)
            .where(
              and(
                eq(posts.userId, req.user.id),
                sql`ABS(EXTRACT(EPOCH FROM "created_at") * 1000 - ${approxTimestamp}) < 10000`
              )
            )
            .orderBy(sql`ABS(EXTRACT(EPOCH FROM "created_at") * 1000 - ${approxTimestamp})`);
          
          if (postsAroundTime.length > 0) {
            // Use the closest post
            post = postsAroundTime[0];
            postId = post.id;
            console.log(`Found post by timestamp proximity: ${postId}`);
          }
        }
      }

      // Special handling for posts with timestamp IDs
      if (!post && /^\d+$/.test(postIdStr) && postIdStr.length > 10) {
        const timestampValue = parseInt(postIdStr);
        const approxTimestamp = new Date(timestampValue);
        const timestampThreshold = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        // Log the timestamp-based search approach
        console.log(`Attempting advanced search for post with timestamp ID: ${postIdStr}`);
        console.log(`Parsed timestamp: ${approxTimestamp.toISOString()}`);
        logger.info(`Attempting advanced search for post with timestamp ID: ${postIdStr}`);
        logger.info(`Parsed timestamp: ${approxTimestamp.toISOString()}`);
        
        // First, try to find any post by this user with a created_at timestamp close to the ID value
        // This covers any post type (including miscellaneous posts)
        const recentPosts = await db
          .select()
          .from(posts)
          .where(
            and(
              eq(posts.userId, req.user.id),
              // Created within the last 24 hours
              sql`ABS(EXTRACT(EPOCH FROM "created_at") * 1000 - ${timestampValue}) < ${timestampThreshold}`
            )
          )
          .orderBy(sql`ABS(EXTRACT(EPOCH FROM "created_at") * 1000 - ${timestampValue})`)
          .limit(5);
        
        if (recentPosts.length > 0) {
          // Use the post with the closest timestamp to the ID
          post = recentPosts[0];
          postId = post.id;
          console.log(`Found post by timestamp proximity: ${postId}, type: ${post.type}, created: ${post.createdAt}`);
          logger.info(`Found post by timestamp proximity: ${postId}, type: ${post.type}, created: ${post.createdAt}`);
        }
        
        // If still not found, try specific handling for memory verse posts
        if (!post) {
          console.log(`No posts found by timestamp proximity, trying memory verse specific search`);
          
          // Try to find memory verse posts by this user in the past 24 hours
          // and order by creation time to get the most recent one
          const recentMemoryVersePosts = await db
            .select()
            .from(posts)
            .where(
              and(
                eq(posts.userId, req.user.id),
                eq(posts.type, 'memory_verse'),
                // Created within the last 24 hours
                sql`"created_at" > NOW() - INTERVAL '24 hours'`
              )
            )
            .orderBy(desc(posts.createdAt))
            .limit(5);
          
          if (recentMemoryVersePosts.length > 0) {
            // Use the most recent memory verse post
            post = recentMemoryVersePosts[0];
            postId = post.id;
            console.log(`Found recent memory verse post as fallback: ${postId}, created: ${post.createdAt}`);
            logger.info(`Found recent memory verse post as fallback: ${postId}, created: ${post.createdAt}`);
          }
        }
      }
      
      // If still not found after all attempts, handle that
      if (!post) {
        console.log(`Post with ID ${postIdStr} not found during deletion attempt`);
        logger.info(`Post with ID ${postIdStr} not found during deletion attempt`);
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if user is admin or the post owner
      if (!req.user.isAdmin && post.userId !== req.user.id) {
        console.log(`User ${req.user.id} not authorized to delete post ${postId} owned by ${post.userId}`);
        logger.info(`User ${req.user.id} not authorized to delete post ${postId} owned by ${post.userId}`);
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }

      // Delete associated media files if they exist
      if (post.mediaUrl) {
        try {
          console.log(`Deleting file associated with post: ${post.mediaUrl}`);
          logger.info(`Deleting file associated with post: ${post.mediaUrl}`);
          await spartaStorage.deleteFile(post.mediaUrl);
          console.log(`Successfully deleted media file for post: ${postId}`);
          logger.info(`Successfully deleted media file for post: ${postId}`);
        } catch (fileError) {
          console.error(`Error deleting media file for post ${postId}:`, fileError);
          logger.error(`Error deleting media file for post ${postId}:`, fileError);
          // Continue with post deletion even if file deletion fails
        }
      }
      
      // Use a transaction to ensure all deletes succeed or none do
      await db.transaction(async (tx) => {
        try {
          // First delete any reactions that reference this post
          await tx
            .delete(reactions)
            .where(eq(reactions.postId, postId));
          console.log(`Deleted reactions for post ${postId}`);
          logger.info(`Deleted reactions for post ${postId}`);

          // Then delete any comments on the post
          await tx
            .delete(posts)
            .where(eq(posts.parentId, postId));
          console.log(`Deleted comments for post ${postId}`);
          logger.info(`Deleted comments for post ${postId}`);

          // Finally delete the post itself
          await tx
            .delete(posts)
            .where(eq(posts.id, postId));
          console.log(`Post ${postId} successfully deleted`);
          logger.info(`Post ${postId} successfully deleted`);
        } catch (txError) {
          console.error(`Transaction error while deleting post ${postId}:`, txError);
          logger.error(`Transaction error while deleting post ${postId}:`, txError);
          throw txError; // Re-throw to roll back the transaction
        }
      });

      return res.status(200).json({ 
        message: "Post deleted successfully",
        id: postId 
      });
    } catch (error) {
      console.error("Error deleting post:", error);
      logger.error("Error deleting post:", error);
      return res.status(500).json({
        message: "Failed to delete post",
        error: error instanceof Error ? error.message : "Unknown error"
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

      logger.info(`Manual check daily scores for user ${userId} with timezone offset ${tzOffset}`);

      // Forward to the post endpoint
      // We're creating a fake request with the necessary properties
      await checkDailyScores({ body: { userId, tzOffset } } as Request, res);
    } catch (error) {
      logger.error('Error in GET daily score check:', error);
      res.status(500).json({
        message: "Failed to check daily scores",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add the actual POST endpoint for the daily scores check
  router.post("/api/check-daily-scores", async (req, res) => {
    try {
      // This is the proper handler for incoming scheduled requests
      await checkDailyScores(req, res);
    } catch (error) {
      logger.error('Error in POST daily score check:', error);
      res.status(500).json({
        message: "Failed to check daily scores",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Main function to check daily scores
  const checkDailyScores = async (req: Request, res: Response) => {
    try {
      logger.info('Starting daily score check with request body:', req.body);
      
      // Get current hour and minute from request body or use current time
      const currentHour = req.body?.currentHour !== undefined 
        ? parseInt(req.body.currentHour) 
        : new Date().getHours();
      
      const currentMinute = req.body?.currentMinute !== undefined 
        ? parseInt(req.body.currentMinute) 
        : new Date().getMinutes();
      
      // Get timezone offset from request if provided (in minutes)
      const tzOffset = req.body?.tzOffset !== undefined 
        ? parseInt(req.body.tzOffset) 
        : 0; // Default to UTC if not provided
      
      logger.info(`Check daily scores at time: ${currentHour}:${currentMinute} with timezone offset: ${tzOffset}`);
      
      // Get all users using a more explicit query to avoid type issues
      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          isAdmin: users.isAdmin,
          teamId: users.teamId,
          notificationTime: users.notificationTime,
          timezoneOffset: users.timezoneOffset
        })
        .from(users);

      logger.info(`Found ${Array.isArray(allUsers) ? allUsers.length : 0} users to check`);
      
      // Get yesterday's date with proper timezone handling
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const dayOfWeek = today.getDay();

      logger.info(`Checking points from ${yesterday.toISOString()} to ${today.toISOString()}`);

      // Process each user
      for (const user of allUsers) {
        try {
          logger.info(`Processing user ${user.id} (${user.username})`);

          // Get user's posts from yesterday with detailed logging
          // Note: Database column is "created_at" not "createdAt"
          const userPostsResult = await db
            .select({
              points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`,
              types: sql<string[]>`array_agg(distinct ${posts.type})`,
              count: sql<number>`count(*)::integer`
            })
            .from(posts)
            .where(
              and(
                eq(posts.userId, user.id),
                gte(sql`posts.created_at`, yesterday), // Using SQL template for created_at
                lt(sql`posts.created_at`, today),      // Using SQL template for created_at
                isNull(posts.parentId) // Don't count comments
              )
            );

          const userPosts = userPostsResult[0];
          const totalPoints = userPosts?.points || 0;
          const postTypes = userPosts?.types || [];
          const postCount = userPosts?.count || 0;

          // Expected points vary by day:
          // Monday-Friday: 15 points (9 food + 3 workout + 3 scripture)
          // Saturday: 22 points (9 food + 3 scripture + 10 memory verse)
          // Sunday: 3 points (just scripture)
          const expectedPoints = dayOfWeek === 6 ? 22 : (dayOfWeek === 0 ? 3 : 15);

          logger.info(`User ${user.id} (${user.username}) activity:`, {
            totalPoints,
            expectedPoints,
            postTypes,
            postCount,
            dayOfWeek,
            date: yesterday.toISOString()
          });

          // If points are less than expected, send notification
          if (totalPoints < expectedPoints) {
            // Get a more detailed breakdown of what was posted yesterday
            const postsByType = await db
              .select({
                type: posts.type,
                count: sql<number>`count(*)::integer`
              })
              .from(posts)
              .where(
                and(
                  eq(posts.userId, user.id),
                  gte(sql`posts.created_at`, yesterday), // Using SQL template for created_at
                  lt(sql`posts.created_at`, today),      // Using SQL template for created_at
                  isNull(posts.parentId) // Don't count comments
                )
              )
              .groupBy(posts.type);

            // Create maps to track what's posted
            const counts: Record<string, number> = {
              food: 0,
              workout: 0,
              scripture: 0,
              memory_verse: 0
            };

            // Fill in actual counts
            postsByType.forEach(post => {
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
                  gte(notifications.createdAt, startOfToday)
                )
              );

            // Skip if user has no notification time preference set
            if (!user.notificationTime) {
              logger.info(`Skipping user ${user.id} - no notification time preference set`);
              continue;
            }

            // Parse user's notification time preference (HH:MM format stored in user's local time)
            const notificationTimeParts = user.notificationTime.split(':');
            const preferredHour = parseInt(notificationTimeParts[0]);
            const preferredMinute = parseInt(notificationTimeParts[1] || '0');
            
            // Convert server UTC time to user's local timezone
            // timezoneOffset is stored in minutes (e.g., -300 for UTC-5/Central Time)
            const userTimezoneOffsetMinutes = user.timezoneOffset || 0;
            
            // Create a date object for current server time
            const serverTime = new Date();
            serverTime.setHours(currentHour, currentMinute, 0, 0);
            
            // Convert to user's local time by applying their timezone offset
            const userLocalTime = new Date(serverTime.getTime() + (userTimezoneOffsetMinutes * 60 * 1000));
            const userLocalHour = userLocalTime.getUTCHours();
            const userLocalMinute = userLocalTime.getUTCMinutes();
            
            // Compare in user's local timezone
            const currentTimeInMinutes = userLocalHour * 60 + userLocalMinute;
            const preferredTimeInMinutes = preferredHour * 60 + preferredMinute;
            
            // Check if the preferred notification time has passed today in user's timezone
            const hasTimePassed = currentTimeInMinutes >= preferredTimeInMinutes;
                
            logger.info(`Notification time check for user ${user.id}:`, {
              userId: user.id,
              email: user.email,
              serverTimeUTC: `${currentHour}:${String(currentMinute).padStart(2, '0')}`,
              userLocalTime: `${userLocalHour}:${String(userLocalMinute).padStart(2, '0')}`,
              preferredTime: `${preferredHour}:${String(preferredMinute).padStart(2, '0')}`,
              timezoneOffset: userTimezoneOffsetMinutes,
              hasTimePassed,
              alreadySentToday: existingNotifications.length > 0
            });
            
            // Only send if:
            // 1. No notification sent today
            // 2. Current time has passed the user's preferred notification time
            if (existingNotifications.length === 0 && hasTimePassed) {
              const notification = {
                userId: user.id,
                title: "Daily Reminder",
                message,
                read: false,
                createdAt: new Date(),
                type: "reminder",
                sound: "default" // Add sound property for mobile notifications
              };

              const [insertedNotification] = await db
                .insert(notifications)
                .values(notification)
                .returning();

              logger.info(`Created notification for user ${user.id}:`, {
                notificationId: insertedNotification.id,
                userId: user.id,
                message: notification.message
              });
              
              // Send via WebSocket if user is connected
              const userClients = clients.get(user.id);
              if (userClients && userClients.size > 0) {
                const notificationData = {
                  id: insertedNotification.id,
                  title: notification.title,
                  message: notification.message,
                  sound: notification.sound,
                  type: notification.type
                };

                broadcastNotification(user.id, notificationData);
              }
            } else {
              logger.info(`Skipping notification for user ${user.id} - already sent today`, {
                userId: user.id,
                existingNotifications: existingNotifications.length
              });
            }
          } else {
            logger.info(`No notification needed for user ${user.id}, met daily goal`);
          }
        } catch (userError) {
          logger.error(`Error processing user ${user.id}:`, userError);
          continue; // Continue with next user even if one fails
        }
      }

      res.json({ message: "Daily score check completed" });
    } catch (error) {
      logger.error('Error in daily score check:', error);
      res.status(500).json({
        message: "Failed to check daily scores",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  };

  // Add activity progress endpoint before the return httpServer statement
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

      // Program start date (2/24/2025)
      const programStart = calculateProgramStartDate(new Date(user.teamJoinedAt));

      // Get current time in user's timezone
      const utcNow = new Date();
      const userLocalNow = toUserLocalTime(utcNow);

      // Get start of day in user's timezone
      const userStartOfDay = new Date(userLocalNow);
      userStartOfDay.setHours(0, 0, 0, 0);

      // Calculate days since program start in user's timezone
      const msSinceStart = userStartOfDay.getTime() - programStart.getTime();
      const daysSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60 * 24));

      // Calculate current week and day in user's timezone
      const weekNumber = Math.floor(daysSinceStart / 7) + 1;
      const rawDay = userLocalNow.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const dayNumber = rawDay === 0 ? 7 : rawDay; // Convert to 1 = Monday, ..., 7 = Sunday

      // Calculate user's progress based on their local time
      const progressStart = toUserLocalTime(new Date(user.teamJoinedAt));
      const progressDays = Math.floor((userLocalNow.getTime() - progressStart.getTime()) / (1000 * 60 * 60 * 24));

      // Debug info
      console.log('Date Calculations:', {
        timezone: `UTC${tzOffset >= 0 ? '+' : ''}${-tzOffset/60}`,
        utcNow: utcNow.toISOString(),
        userLocalNow: userLocalNow.toLocaleString(),
        daysSinceStart,
        weekNumber,
        dayNumber,
        progressDays
      });

      res.json({
        currentWeek: weekNumber,
        currentDay: dayNumber,
        daysSinceStart,
        progressDays,
        debug: {
          timezone: `UTC${tzOffset >= 0 ? '+' : ''}${-tzOffset/60}`,
          localTime: userLocalNow.toLocaleString()
        }
      });

    } catch (error) {
      logger.error('Error calculating activity dates:', error);
      res.status(500).json({
        message: "Failed to calculate activity dates",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Measurements endpoints
  router.post("/api/measurements", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      logger.info('Creating measurement with data:', req.body);

      const parsedData = insertMeasurementSchema.safeParse({
        ...req.body,
        userId: req.user.id,
        date: new Date()
      });

      if (!parsedData.success) {
        logger.error('Validation errors:', parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid measurement data",
          errors: parsedData.error.errors
        });
      }

      const measurement = await db
        .insert(measurements)
        .values(parsedData.data)
        .returning();

      res.status(201).json(measurement[0]);
    } catch (error) {
      logger.error('Error creating measurement:', error);
      res.status(500).json({
        message: "Failed to create measurement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  router.get("/api/measurements", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userId = req.query.userId ? parseInt(req.query.userId as string) : req.user.id;

      if (req.user.id !== userId && !req.user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to view these measurements" });
      }

      const userMeasurements = await db
        .select()
        .from(measurements)
        .where(eq(measurements.userId, userId))
        .orderBy(desc(measurements.date));

      res.json(userMeasurements);
    } catch (error) {
      logger.error('Error fetching measurements:', error);
      res.status(500).json({
        message: "Failed to fetch measurements",
        error: error instanceof Error ? error.message : "Unknown error"
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
      if (dateStr.indexOf('T') === -1) {
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
      logger.info(`Calculating points for user ${userId} on date ${date.toISOString()}`, {
        requestedDate: dateStr,
        normalizedStartDate: startOfDay.toISOString(),
        normalizedEndDate: endOfDay.toISOString()
      });

      // Calculate total points for the day with detailed logging
      const result = await db
        .select({
          points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(sql`posts.created_at`, startOfDay),
            lt(sql`posts.created_at`, endOfDay),
            isNull(posts.parentId) // Don't count comments in the total
          )
        );

      // Get post details for debugging
      const postDetails = await db
        .select({
          id: posts.id,
          type: posts.type,
          points: posts.points,
          createdAt: posts.createdAt
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(sql`posts.created_at`, startOfDay),
            lt(sql`posts.created_at`, endOfDay),
            isNull(posts.parentId)
          )
        );

      const totalPoints = result[0]?.points || 0;

      // Log the response details
      logger.info(`Daily points for user ${userId}: ${totalPoints}`, {
        date: date.toISOString(),
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString(),
        postCount: postDetails.length,
        posts: JSON.stringify(postDetails)
      });

      // Ensure content type is set
      res.setHeader('Content-Type', 'application/json');
      res.json({ points: totalPoints });
    } catch (error) {
      logger.error('Error calculating daily points:', error);
      res.status(500).json({
        message: "Failed to calculate daily points",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add notifications count endpoint
  router.get("/api/notifications/unread", authenticate, async (req, res) => {    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const unreadCount = await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, req.user.id),
            eq(notifications.read, false)
          )
        );

      res.json({ unreadCount: unreadCount[0].count });
    } catch (error) {
      logger.error('Error fetching unread notifications:', error);
      res.status(500).json({
        message: "Failed to fetch notification count",
        error: error instanceof Error ? error.message : "Unknown error"
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
            sql`${notifications.id} = ANY(${notificationIds})`
          )
        );

      res.json({ message: "Notifications marked as read" });
    } catch (error) {
      logger.error('Error marking notifications as read:', error);
      res.status(500).json({
        message: "Failed to mark notifications as read",
        error: error instanceof Error ? error.message : "Unknown error"
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
      logger.error('Error fetching notifications:', error);
      res.status(500).json({
        message: "Failed to fetch notifications",
        error: error instanceof Error ? error.message : "Unknown error"
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
      }

      // Prepare update data
      const updateData = {
        ...req.body,
        teamJoinedAt: req.body.teamId ? new Date() : null
      };

      // Update user
      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Return sanitized user data
      res.setHeader('Content-Type', 'application/json');
      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        teamId: updatedUser.teamId,
        isAdmin: updatedUser.isAdmin,
        isTeamLead: updatedUser.isTeamLead,
        imageUrl: updatedUser.imageUrl,
        teamJoinedAt: updatedUser.teamJoinedAt
      });
    } catch (error) {
      logger.error('Error updating user:', error);
      res.status(500).json({
        message: "Failed to update user",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  router.post("/api/notifications/:notificationId/read", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const notificationId = parseInt(req.params.notificationId);
      if (isNaN(notificationId)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      // Set content type before sending response
      res.setHeader('Content-Type', 'application/json');

      const [updatedNotification] = await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.userId, req.user.id),
            eq(notifications.id, notificationId)
          )
        )
        .returning();

      if (!updatedNotification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      res.json({ message: "Notification marked as read", notification: updatedNotification });
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      res.status(500).json({
        message: "Failed to mark notification as read",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add messages endpoints before return statement
  router.post("/api/messages", authenticate, upload.single('image'), async (req, res) => {
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
          imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
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
      logger.error('Error creating message:', error);
      res.status(500).json({
        message: "Failed to create message",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

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
              eq(messages.recipientId, otherUserId)
            ),
            and(
              eq(messages.senderId, otherUserId),
              eq(messages.recipientId, req.user.id)
            )
          )
        )
        .orderBy(messages.createdAt);

      res.json(userMessages);
    } catch (error) {
      logger.error('Error fetching messages:', error);
      res.status(500).json({
        message: "Failed to fetch messages",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get unread messages count
  router.get("/api/messages/unread/count", authenticate, async (req, res) => {try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const [result] = await db
        .select({
          count: sql<number>`count(*)::integer`,
        })
        .from(messages)
        .where(
          and(
            eq(messages.recipientId, req.user.id),
            eq(messages.isRead, false)
          )
        );

      res.json({ unreadCount: result.count });
    } catch (error) {
      logger.error('Error getting unread message count:', error);
      res.status(500).json({
        message: "Failed to get unread message count",
        error: error instanceof Error ? error.message : "Unknown error"
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
            eq(messages.isRead, false)
          )
        );

      res.json({ message: "Messages marked as read" });
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      res.status(500).json({
        message: "Failed to mark messages as read",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add messages endpoints before return statement
  router.get("/api/messages/unread/by-sender", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Get all senders who have sent unread messages to the current user
      const unreadBySender = await db
        .select({
          senderId: messages.senderId,
          hasUnread: sql<boolean>`true`
        })
        .from(messages)
        .where(
          and(
            eq(messages.recipientId, req.user.id),
            eq(messages.isRead, false)
          )
        )
        .groupBy(messages.senderId);

      // Convert to a map of senderId -> hasUnread
      const unreadMap = Object.fromEntries(
        unreadBySender.map(({ senderId }) => [senderId, true])
      );

      res.json(unreadMap);
    } catch (error) {
      logger.error('Error getting unread messages by sender:', error);
      res.status(500).json({
        message: "Failed to get unread messages by sender",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add this endpoint before the app.use(router) line
  // This endpoint has been moved to line ~3116 to support achievement_notifications_enabled

  router.post("/api/notifications/read-all", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const result = await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.userId, req.user.id))
        .returning();

      logger.info(`Marked ${result.length} notifications as read for user ${req.user.id}`);

      // Set content type and ensure proper JSON response
      res.setHeader('Content-Type', 'application/json');
      res.json({ 
        message: "All notifications marked as read",
        count: result.length
      });
    } catch (error) {
      logger.error('Error marking all notifications as read:', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        message: "Failed to mark notifications as read",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add activity progress endpoint before the return httpServer statement
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

      // Program start date (2/24/2025)
      const programStart = calculateProgramStartDate(new Date(user.teamJoinedAt));

      // Get current time in user's timezone
      const utcNow = new Date();
      const userLocalNow = toUserLocalTime(utcNow);

      // Get start of day in user's timezone
      const userStartOfDay = new Date(userLocalNow);
      userStartOfDay.setHours(0, 0, 0, 0);

      // Calculate days since program start in user's timezone
      const msSinceStart = userStartOfDay.getTime() - programStart.getTime();
      const daysSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60 * 24));

      // Calculate current week and day in user's timezone
      const weekNumber = Math.floor(daysSinceStart / 7) + 1;
      const rawDay = userLocalNow.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const dayNumber = rawDay === 0 ? 7 : rawDay; // Convert to 1 = Monday, ..., 7 = Sunday

      // Calculate user's progress based on their local time
      const progressStart = toUserLocalTime(new Date(user.teamJoinedAt));
      const progressDays = Math.floor((userLocalNow.getTime() - progressStart.getTime()) / (1000 * 60 * 60 * 24));

      // Debug info
      console.log('Date Calculations:', {
        timezone: `UTC${tzOffset >= 0 ? '+' : ''}${-tzOffset/60}`,
        utcNow: utcNow.toISOString(),
        userLocalNow: userLocalNow.toLocaleString(),
        daysSinceStart,
        weekNumber,
        dayNumber,
        progressDays
      });

      res.json({
        currentWeek: weekNumber,
        currentDay: dayNumber,
        daysSinceStart,
        progressDays,
        debug: {
          timezone: `UTC${tzOffset >= 0 ? '+' : ''}${-tzOffset/60}`,
          localTime: userLocalNow.toLocaleString()
        }
      });

    } catch (error) {
      logger.error('Error calculating activity dates:', error);
      res.status(500).json({
        message: "Failed to calculate activity dates",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Measurements endpoints
  router.post("/api/measurements", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      logger.info('Creating measurement with data:', req.body);

      const parsedData = insertMeasurementSchema.safeParse({
        ...req.body,
        userId: req.user.id,
        date: new Date()
      });

      if (!parsedData.success) {
        logger.error('Validation errors:', parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid measurement data",
          errors: parsedData.error.errors
        });
      }

      const measurement = await db
        .insert(measurements)
        .values(parsedData.data)
        .returning();

      res.status(201).json(measurement[0]);
    } catch (error) {
      logger.error('Error creating measurement:', error);
      res.status(500).json({
        message: "Failed to create measurement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  router.get("/api/measurements", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userId = req.query.userId ? parseInt(req.query.userId as string) : req.user.id;

      if (req.user.id !== userId && !req.user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to view these measurements" });
      }

      const userMeasurements = await db
        .select()
        .from(measurements)
        .where(eq(measurements.userId, userId))
        .orderBy(desc(measurements.date));

      res.json(userMeasurements);
    } catch (error) {
      logger.error('Error fetching measurements:', error);
      res.status(500).json({
        message: "Failed to fetch measurements",
        error: error instanceof Error ? error.message : "Unknown error"
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
      if (dateStr.indexOf('T') === -1) {
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
      logger.info(`Calculating points for user ${userId} on date ${date.toISOString()}`, {
        requestedDate: dateStr,
        normalizedStartDate: startOfDay.toISOString(),
        normalizedEndDate: endOfDay.toISOString()
      });

      // Calculate total points for the day with detailed logging
      const result = await db
        .select({
          points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfDay),
            lt(posts.createdAt, endOfDay),
            isNull(posts.parentId) // Don't count comments in the total
          )
        );

      // Get post details for debugging
      const postDetails = await db
        .select({
          id: posts.id,
          type: posts.type,
          points: posts.points,
          createdAt: posts.createdAt
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfDay),
            lt(posts.createdAt, endOfDay),
            isNull(posts.parentId)
          )
        );

      const totalPoints = result[0]?.points || 0;

      // Log the response details
      logger.info(`Daily points for user ${userId}: ${totalPoints}`, {
        date: date.toISOString(),
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString(),
        postCount: postDetails.length,
        posts: JSON.stringify(postDetails)
      });

      // Ensure content type is set
      res.setHeader('Content-Type', 'application/json');
      res.json({ points: totalPoints });
    } catch (error) {
      logger.error('Error calculating daily points:', error);
      res.status(500).json({
        message: "Failed to calculate daily points",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add notifications count endpoint
  router.get("/api/notifications/unread", authenticate, async (req, res) => {    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const unreadCount = await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, req.user.id),
            eq(notifications.read, false)
          )
        );

      res.json({ unreadCount: unreadCount[0].count });
    } catch (error) {
      logger.error('Error fetching unread notifications:', error);
      res.status(500).json({
        message: "Failed to fetch notification count",
        error: error instanceof Error ? error.message : "Unknown error"
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
            sql`${notifications.id} = ANY(${notificationIds})`
          )
        );

      res.json({ message: "Notifications marked as read" });
    } catch (error) {
      logger.error('Error marking notifications as read:', error);
      res.status(500).json({
        message: "Failed to mark notifications as read",
        error: error instanceof Error ? error.message : "Unknown error"
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
      logger.error('Error fetching notifications:', error);
      res.status(500).json({
        message: "Failed to fetch notifications",
        error: error instanceof Error ? error.message : "Unknown error"
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
      }

      // Prepare update data
      const updateData = {
        ...req.body,
        teamJoinedAt: req.body.teamId ? new Date() : null
      };

      // Update user
      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Return sanitized user data
      res.setHeader('Content-Type', 'application/json');
      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        teamId: updatedUser.teamId,
        isAdmin: updatedUser.isAdmin,
        isTeamLead: updatedUser.isTeamLead,
        imageUrl: updatedUser.imageUrl,
        teamJoinedAt: updatedUser.teamJoinedAt
      });
    } catch (error) {
      logger.error('Error updating user:', error);
      res.status(500).json({
        message: "Failed to update user",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  router.post("/api/notifications/:notificationId/read", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const notificationId = parseInt(req.params.notificationId);
      if (isNaN(notificationId)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      // Set content type before sending response
      res.setHeader('Content-Type', 'application/json');

      const [updatedNotification] = await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.userId, req.user.id),
            eq(notifications.id, notificationId)
          )
        )
        .returning();

      if (!updatedNotification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      res.json({ message: "Notification marked as read", notification: updatedNotification });
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      res.status(500).json({
        message: "Failed to mark notification as read",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add messages endpoints before return statement
  router.post("/api/messages", authenticate, upload.single('image'), async (req, res) => {
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
          imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
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
      logger.error('Error creating message:', error);
      res.status(500).json({
        message: "Failed to create message",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

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
              eq(messages.recipientId, otherUserId)
            ),
            and(
              eq(messages.senderId, otherUserId),
              eq(messages.recipientId, req.user.id)
            )
          )
        )
        .orderBy(messages.createdAt);

      res.json(userMessages);
    } catch (error) {
      logger.error('Error fetching messages:', error);
      res.status(500).json({
        message: "Failed to fetch messages",
        error: error instanceof Error ? error.message : "Unknown error"
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
            eq(messages.isRead, false)
          )
        );

      res.json({ unreadCount: result.count });
    } catch (error) {
      logger.error('Error getting unread message count:', error);
      res.status(500).json({
        message: "Failed to get unread message count",
        error: error instanceof Error ? error.message : "Unknown error"
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
            eq(messages.isRead, false)
          )
        );

      res.json({ message: "Messages marked as read" });
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      res.status(500).json({
        message: "Failed to mark messages as read",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add messages endpoints before return statement
  router.get("/api/messages/unread/by-sender", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Get all senders who have sent unread messages to the current user
      const unreadBySender = await db
        .select({
          senderId: messages.senderId,
          hasUnread: sql<boolean>`true`
        })
        .from(messages)
        .where(
          and(
            eq(messages.recipientId, req.user.id),
            eq(messages.isRead, false)
          )
        )
        .groupBy(messages.senderId);

      // Convert to a map of senderId -> hasUnread
      const unreadMap = Object.fromEntries(
        unreadBySender.map(({ senderId }) => [senderId, true])
      );

      res.json(unreadMap);
    } catch (error) {
      logger.error('Error getting unread messages by sender:', error);
      res.status(500).json({
        message: "Failed to get unread messages by sender",
        error: error instanceof Error ? error.message : "Unknown error"
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

  router.post("/api/users/notification-schedule", authenticate, async (req, res) => {
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
          return res.status(400).json({ message: "Invalid time format. Use HH:mm format." });
        }
        updateData.notificationTime = notificationTime;
      }

      // Add achievement notifications enabled setting if provided
      if (achievementNotificationsEnabled !== undefined) {
        updateData.achievementNotificationsEnabled = achievementNotificationsEnabled;
      }

      // Update user notification preferences
      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, req.user.id))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      logger.error('Error updating notification schedule:', error);
      res.status(500).json({
        message: "Failed to update notification schedule",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.use(router);

  // Create HTTP server
  const httpServer = createServer(app);

  // Create WebSocket server on a distinct path
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws'
  });

  // Map to store active client connections by user ID
  const clients = new Map<number, Set<WebSocket>>();

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected at', new Date().toISOString());
    logger.info('WebSocket client connected');
    let userId: number | null = null;
    let pingTimeout: NodeJS.Timeout | null = null;
    
    // Set custom properties to track socket health
    (ws as any).isAlive = true;
    (ws as any).lastPingTime = Date.now();
    (ws as any).userId = null;
    
    // Send an immediate connection confirmation
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: "connected",
          message: "Connection established with server",
          timestamp: Date.now()
        }));
        console.log('Sent connection confirmation message to client');
      } catch (err) {
        console.error('Error sending connection confirmation:', err);
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
      
      // Set a timeout to terminate the connection if no pong is received
      pingTimeout = setTimeout(() => {
        logger.warn(`WebSocket connection timed out after no response for 30s, userId: ${userId || 'unauthenticated'}`);
        ws.terminate();
      }, 30000); // 30 seconds timeout
    };
    
    // Start the heartbeat immediately on connection
    heartbeat();

    ws.on('message', async (message) => {
      try {
        // Reset the heartbeat on any message
        heartbeat();
        
        const data = JSON.parse(message.toString());
        
        // Handle pong message (response to our ping)
        if (data.type === 'pong') {
          // Client responded to our ping, update alive status
          (ws as any).isAlive = true;
          (ws as any).lastPongTime = Date.now();
          
          // Calculate round-trip time if we have both ping and pong timestamps
          if (data.pingTimestamp) {
            const roundTripTime = Date.now() - data.pingTimestamp;
            if (roundTripTime > 5000) {
              // Log only if latency is high (over 5 seconds)
              logger.warn(`High WebSocket latency detected for user ${userId}: ${roundTripTime}ms`);
            }
          }
          return;
        }

        // Handle authentication message
        if (data.type === 'auth') {
          userId = parseInt(data.userId);
          if (isNaN(userId)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid user ID' }));
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
            logger.warn(`User ${userId} has too many WebSocket connections (${userClients.size}), closing oldest`);
            
            // Sort connections by last activity time and close the oldest ones
            const oldConnections = Array.from(userClients)
              .filter(client => (client as any).lastPingTime)
              .sort((a, b) => (a as any).lastPingTime - (b as any).lastPingTime)
              .slice(0, userClients.size - 8); // Keep the 8 newest connections
              
            // Close the old connections
            for (const oldClient of oldConnections) {
              try {
                userClients.delete(oldClient);
                oldClient.close(1000, "Too many connections for this user");
              } catch (err) {
                logger.error(`Error closing old connection: ${err}`, Error(String(err)));
              }
            }
          }
          
          userClients?.add(ws);

          logger.info(`WebSocket user ${userId} authenticated with ${userClients?.size || 0} total connections`);
          ws.send(JSON.stringify({ type: 'auth_success', userId }));
        }
        
        // Handle ping from client (different from our server-initiated ping)
        if (data.type === 'ping') {
          // Client is checking if we're still alive, respond with pong
          ws.send(JSON.stringify({ 
            type: 'pong', 
            timestamp: Date.now(),
            receivedAt: data.timestamp
          }));
        }
      } catch (error) {
        logger.error('WebSocket message error:', error instanceof Error ? error : new Error(String(error)));
        
        try {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Invalid message format' 
          }));
        } catch (sendErr) {
          logger.error('Error sending error message to client:', sendErr instanceof Error ? sendErr : new Error(String(sendErr)));
          // If we can't send a message, the connection might be dead
          ws.terminate();
        }
      }
    });

    // Handle client disconnection
    ws.on('close', () => {
      // Clear the ping timeout
      if (pingTimeout) {
        clearTimeout(pingTimeout);
        pingTimeout = null;
      }
      
      if (userId) {
        const userClients = clients.get(userId);
        if (userClients) {
          userClients.delete(ws);
          logger.info(`WebSocket client disconnected for user ${userId}, remaining connections: ${userClients.size}`);
          
          if (userClients.size === 0) {
            clients.delete(userId);
            logger.info(`No more connections for user ${userId}, removed from clients map`);
          }
        }
      } else {
        logger.info('Unauthenticated WebSocket client disconnected');
      }
    });
    
    // Handle connection errors
    ws.on('error', (err) => {
      logger.error(`WebSocket error for user ${userId || 'unauthenticated'}:`, err instanceof Error ? err : new Error(String(err)));
      
      // Clear the ping timeout
      if (pingTimeout) {
        clearTimeout(pingTimeout);
        pingTimeout = null;
      }
      
      // On error, terminate the connection
      try {
        ws.terminate();
      } catch (termErr) {
        logger.error('Error terminating WebSocket connection:', termErr instanceof Error ? termErr : new Error(String(termErr)));
      }
      
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
        type: 'notification',
        data: notification
      });

      userClients.forEach(client => {
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
    logger.info('Starting WebSocket heartbeat monitoring');
    
    const HEARTBEAT_INTERVAL = 30000; // Check every 30 seconds
    
    setInterval(() => {
      let activeConnections = 0;
      let closedConnections = 0;
      
      // For each user in our clients map
      clients.forEach((userClients, userId) => {
        // For each connection for this user
        userClients.forEach(ws => {
          try {
            // Skip if connection is already closed
            if (ws.readyState !== WebSocket.OPEN) {
              // Connection is not open, close and remove it
              try {
                ws.terminate();
              } catch (err) {
                logger.error(`Error terminating stale connection: ${err}`, Error(String(err)));
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
                logger.error(`Error terminating stale connection: ${err}`, Error(String(err)));
              }
              
              userClients.delete(ws);
              closedConnections++;
              return;
            }
            
            // Mark as not alive - will be marked alive when pong is received
            (ws as any).isAlive = false;
            
            // Send ping
            try {
              ws.send(JSON.stringify({ 
                type: 'ping',
                timestamp: Date.now()
              }));
              
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
                logger.debug(`Error during terminate after ping failure: ${termErr}`);
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
              logger.error(`Error cleaning up connection: ${cleanupErr}`, Error(String(cleanupErr)));
            }
          }
        });
        
        // Clean up user entry if no connections remain
        if (userClients.size === 0) {
          clients.delete(userId);
        }
      });
      
      logger.info(`WebSocket heartbeat complete - active: ${activeConnections}, closed: ${closedConnections}`);
    }, HEARTBEAT_INTERVAL);
  };
  
  // Start the heartbeat monitoring
  startHeartbeatMonitoring();

  // User stats endpoint for simplified My Stats section
  router.get("/api/user/stats", authenticate, async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userId = req.user.id;

      // Get timezone offset in minutes directly from the client
      const tzOffset = parseInt(req.query.tzOffset as string) || 0;

      logger.info(`Stats requested for user ${userId} with timezone offset: ${tzOffset} minutes`);

      // For debugging, let's see what posts this user has today in UTC
      const postsToday = await db.select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, new Date(new Date().setHours(0, 0, 0, 0))),
            lte(posts.createdAt, new Date(new Date().setHours(23, 59, 59, 999)))
          )
        );

      logger.info(`Posts for user ${userId} today in UTC: ${postsToday.length}`);

      // Calculate the local date for the user based on their timezone
      const now = new Date();
      // First convert to UTC by removing the local timezone offset
      const utcTime = now.getTime();
      // Then adjust to user's local time by applying their timezone offset (reversed since getTimezoneOffset returns the opposite)
      const userLocalTime = new Date(utcTime - (tzOffset * 60000));

      logger.info(`User's local time (${userId}): ${userLocalTime.toISOString()}`);

      // Use this adjusted date to create proper day boundaries in the user's local timezone
      const startOfDay = new Date(
        userLocalTime.getFullYear(),
        userLocalTime.getMonth(),
        userLocalTime.getDate(),
        0, 0, 0, 0
      );
      // Convert back to UTC for database query
      const startOfDayUTC = new Date(startOfDay.getTime() + (tzOffset * 60000));

      const endOfDay = new Date(
        userLocalTime.getFullYear(),
        userLocalTime.getMonth(),
        userLocalTime.getDate(),
        23, 59, 59, 999
      );
      // Convert back to UTC for database query
      const endOfDayUTC = new Date(endOfDay.getTime() + (tzOffset * 60000));

      logger.info(`Date range for daily stats (in user's local timezone): ${startOfDayUTC.toISOString()} to ${endOfDayUTC.toISOString()}`);

      const dailyPosts = await db.select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfDayUTC),
            lte(posts.createdAt, endOfDayUTC)
          )
        );

      logger.info(`Found ${dailyPosts.length} posts for user ${userId} for today in their local timezone`);

      let dailyPoints = 0;
      for (const post of dailyPosts) {
        if (post.type === 'food') dailyPoints += 3;
        else if (post.type === 'workout') dailyPoints += 3;
        else if (post.type === 'scripture') dailyPoints += 3;
        else if (post.type === 'memory_verse') dailyPoints += 10;
      }

      // Weekly stats - Start from Sunday in user's local time
      const dayOfWeek = userLocalTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const startOfWeek = new Date(
        userLocalTime.getFullYear(),
        userLocalTime.getMonth(),
        userLocalTime.getDate() - dayOfWeek, // Go back to the start of the week (Sunday)
        0, 0, 0, 0
      );
      // Convert back to UTC for database query
      const startOfWeekUTC = new Date(startOfWeek.getTime() + (tzOffset * 60000));

      logger.info(`Date range for weekly stats (in user's local timezone): ${startOfWeekUTC.toISOString()} to ${endOfDayUTC.toISOString()}`);

      const weeklyPosts = await db.select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfWeekUTC),
            lte(posts.createdAt, endOfDayUTC)
          )
        );

      let weeklyPoints = 0;
      for (const post of weeklyPosts) {
        if (post.type === 'food') weeklyPoints += 3;
        else if (post.type === 'workout') weeklyPoints += 3;
        else if (post.type === 'scripture') weeklyPoints += 3;
        else if (post.type === 'memory_verse') weeklyPoints += 10;
      }

      // Monthly average - Three months ago in user's local time
      const threeMonthsAgo = new Date(
        userLocalTime.getFullYear(),
        userLocalTime.getMonth() - 3,
        userLocalTime.getDate(),
        0, 0, 0, 0
      );
      // Convert back to UTC for database query
      const threeMonthsAgoUTC = new Date(threeMonthsAgo.getTime() + (tzOffset * 60000));

      logger.info(`Date range for monthly stats (in user's local timezone): ${threeMonthsAgoUTC.toISOString()} to ${endOfDayUTC.toISOString()}`);

      const monthlyPosts = await db.select()
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, threeMonthsAgoUTC),
            lte(posts.createdAt, endOfDayUTC)
          )
        );

      let totalPoints = 0;
      for (const post of monthlyPosts) {
        if (post.type === 'food') totalPoints += 3;
        else if (post.type === 'workout') totalPoints += 3;
        else if (post.type === 'scripture') totalPoints += 3;
        else if (post.type === 'memory_verse') totalPoints += 10;
      }

      // Calculate monthly average (total points divided by 3 months)
      const monthlyAvgPoints = Math.round(totalPoints / 3);

      logger.info(`Stats for user ${userId}: daily=${dailyPoints}, weekly=${weeklyPoints}, monthlyAvg=${monthlyAvgPoints}`);
      res.json({
        dailyPoints,
        weeklyPoints,
        monthlyAvgPoints
      });
    } catch (error) {
      logger.error(`Error calculating user stats: ${error instanceof Error ? error.message : String(error)}`);
      next(error);
    }
  });

  // Add endpoint to delete a notification
  router.delete("/api/notifications/:notificationId", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const notificationId = parseInt(req.params.notificationId);
      if (isNaN(notificationId)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      // Set content type before sending response
      res.setHeader('Content-Type', 'application/json');

      // Delete the notification
      const result = await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.userId, req.user.id),
            eq(notifications.id, notificationId)
          )
        )
        .returning();

      // Log the deletion result
      logger.info(`Deletion result for notification ${notificationId}:`, { 
        userId: req.user.id
      });

      if (!result.length) {
        return res.status(404).json({ message: "Notification not found or already deleted" });
      }

      res.json({ message: "Notification deleted successfully", notification: result[0] });
    } catch (error) {
      logger.error('Error deleting notification:', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        message: "Failed to delete notification",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get weekly points for a user
  router.get("/api/points/weekly", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userId = req.query.userId ? parseInt(req.query.userId as string) : req.user.id;
      const now = new Date();
      
      // Get start of week (Monday)
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      startOfWeek.setHours(0, 0, 0, 0);
      
      // Get end of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const result = await db
        .select({
          points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            gte(posts.createdAt, startOfWeek),
            lte(posts.createdAt, endOfWeek),
            isNull(posts.parentId) // Don't count comments
          )
        );

      // Ensure this endpoint also has consistent content-type
      res.setHeader('Content-Type', 'application/json');
      res.json({ 
        points: result[0]?.points || 0,
        startDate: startOfWeek.toISOString(),
        endDate: endOfWeek.toISOString()
      });
    } catch (error) {
      logger.error('Error getting weekly points:', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        message: "Failed to get weekly points",
        error: error instanceof Error ? error.message : "Unknown error"
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
      startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      startOfWeek.setHours(0, 0, 0, 0);
      
      // Get end of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // First get the user's team ID
      const [currentUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!currentUser || !currentUser.teamId) {
        return res.status(400).json({ message: "User not assigned to a team" });
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
          ), 0)::integer AS points`
        })
        .from(users)
        .where(eq(users.teamId, currentUser.teamId))
        .orderBy(sql`points DESC`);

      // Get all teams average points
      const teamStats = await db
        .execute(sql`
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
          GROUP BY t.id, t.name
          ORDER BY avg_points DESC
        `);

      res.setHeader('Content-Type', 'application/json');
      res.json({
        teamMembers,
        teamStats,
        weekRange: {
          start: startOfWeek.toISOString(),
          end: endOfWeek.toISOString()
        }
      });
    } catch (error) {
      logger.error('Error getting leaderboard data:', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        message: "Failed to get leaderboard data",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Log server startup
  logger.info('Server routes and WebSocket registered successfully');

  // Achievement routes
  router.get("/api/achievements", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      
      // Get all achievement types
      const allAchievementTypes = await db
        .select()
        .from(achievementTypes);
        
      // Get user's earned achievements
      const userAchievementsData = await db
        .select({
          userAchievement: userAchievements,
          achievementType: achievementTypes
        })
        .from(userAchievements)
        .innerJoin(
          achievementTypes,
          eq(userAchievements.achievementTypeId, achievementTypes.id)
        )
        .where(eq(userAchievements.userId, req.user.id));
        
      // Format the response
      const earnedAchievements = userAchievementsData.map(item => ({
        id: item.userAchievement.id,
        type: item.achievementType.type,
        name: item.achievementType.name,
        description: item.achievementType.description,
        iconPath: item.achievementType.iconPath,
        pointValue: item.achievementType.pointValue,
        earnedAt: item.userAchievement.earnedAt,
        viewed: item.userAchievement.viewed
      }));
      
      res.json({
        allTypes: allAchievementTypes,
        earned: earnedAchievements
      });
    } catch (error) {
      logger.error("Error fetching achievements:", error);
      res.status(500).json({
        message: "Failed to fetch achievements",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Mark achievement as viewed
  router.patch("/api/achievements/:id/viewed", authenticate, async (req, res) => {
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
            eq(userAchievements.userId, req.user.id)
          )
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
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Get unviewed achievements only
  router.get("/api/achievements/unviewed", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      
      // Get user's unviewed achievements
      const unviewedAchievements = await db
        .select({
          userAchievement: userAchievements,
          achievementType: achievementTypes
        })
        .from(userAchievements)
        .innerJoin(
          achievementTypes,
          eq(userAchievements.achievementTypeId, achievementTypes.id)
        )
        .where(
          and(
            eq(userAchievements.userId, req.user.id),
            eq(userAchievements.viewed, false)
          )
        );
        
      // Format the response
      const formattedAchievements = unviewedAchievements.map(item => ({
        id: item.userAchievement.id,
        type: item.achievementType.type,
        name: item.achievementType.name,
        description: item.achievementType.description,
        iconPath: item.achievementType.iconPath,
        pointValue: item.achievementType.pointValue,
        earnedAt: item.userAchievement.earnedAt
      }));
      
      res.json(formattedAchievements);
    } catch (error) {
      logger.error("Error fetching unviewed achievements:", error);
      res.status(500).json({
        message: "Failed to fetch unviewed achievements",
        error: error instanceof Error ? error.message : "Unknown error"
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
            pointValue: 54
          },
          {
            type: "workout-streak-5",
            name: "Workout Streak - 5 Days",
            description: "Posted workout for 5 consecutive days",
            iconPath: "/achievements/workout-streak.svg",
            pointValue: 15
          },
          {
            type: "scripture-streak-7",
            name: "Scripture Streak - 7 Days",
            description: "Posted scripture for 7 consecutive days",
            iconPath: "/achievements/scripture-streak.svg",
            pointValue: 21
          },
          {
            type: "memory-verse-streak-4",
            name: "Memory Verse Streak - 4 Weeks",
            description: "Posted memory verse for 4 consecutive weeks",
            iconPath: "/achievements/memory-verse.svg",
            pointValue: 10
          }
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
          createdAt: posts.createdAt
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            eq(posts.type, postType),
            gte(posts.createdAt, recentDate),
            isNull(posts.parentId) // Don't count comments
          )
        )
        .orderBy(desc(posts.createdAt));
      
      // Get all achievement types
      const allAchievements = await db
        .select()
        .from(achievementTypes);
      
      // Get user's already earned achievements
      const earnedAchievements = await db
        .select({
          userAchievement: userAchievements,
          achievementType: achievementTypes
        })
        .from(userAchievements)
        .innerJoin(
          achievementTypes,
          eq(userAchievements.achievementTypeId, achievementTypes.id)
        )
        .where(eq(userAchievements.userId, userId));
      
      const earnedTypes = new Set(earnedAchievements.map(a => a.achievementType.type));
      
      // Check for streaks based on post type
      if (postType === 'food') {
        await checkFoodStreak(userId, userPosts, allAchievements, earnedTypes);
      } else if (postType === 'workout') {
        await checkWorkoutStreak(userId, userPosts, allAchievements, earnedTypes);
      } else if (postType === 'scripture') {
        await checkScriptureStreak(userId, userPosts, allAchievements, earnedTypes);
      } else if (postType === 'memory_verse') {
        await checkMemoryVerseStreak(userId, userPosts, allAchievements, earnedTypes);
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
    earnedTypes: Set<string>
  ) => {
    try {
      if (userPosts.length < 3) return; // Need at least 3 posts for a streak
      
      // Group posts by day to count as 1 per day
      const postsByDay = new Map<string, boolean>();
      userPosts.forEach(post => {
        const date = new Date(post.createdAt);
        const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        postsByDay.set(dateKey, true);
      });
      
      // Check for consecutive days
      const sortedDays = Array.from(postsByDay.keys()).sort();
      let currentStreak = 1;
      let maxStreak = 1;
      
      for (let i = 1; i < sortedDays.length; i++) {
        const prevDay = new Date(sortedDays[i-1]);
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
      if (maxStreak >= 6 && !earnedTypes.has('food-streak-6')) {
        await awardAchievement(userId, 'food-streak-6', allAchievements);
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
    earnedTypes: Set<string>
  ) => {
    try {
      if (userPosts.length < 3) return; // Need at least 3 posts for a streak
      
      // Group posts by day to count as 1 per day
      const postsByDay = new Map<string, boolean>();
      userPosts.forEach(post => {
        const date = new Date(post.createdAt);
        const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        postsByDay.set(dateKey, true);
      });
      
      // Check for consecutive days
      const sortedDays = Array.from(postsByDay.keys()).sort();
      let currentStreak = 1;
      let maxStreak = 1;
      
      for (let i = 1; i < sortedDays.length; i++) {
        const prevDay = new Date(sortedDays[i-1]);
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
      if (maxStreak >= 5 && !earnedTypes.has('workout-streak-5')) {
        await awardAchievement(userId, 'workout-streak-5', allAchievements);
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
    earnedTypes: Set<string>
  ) => {
    try {
      if (userPosts.length < 3) return; // Need at least 3 posts for a streak
      
      // Group posts by day to count as 1 per day
      const postsByDay = new Map<string, boolean>();
      userPosts.forEach(post => {
        const date = new Date(post.createdAt);
        const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        postsByDay.set(dateKey, true);
      });
      
      // Check for consecutive days
      const sortedDays = Array.from(postsByDay.keys()).sort();
      let currentStreak = 1;
      let maxStreak = 1;
      
      for (let i = 1; i < sortedDays.length; i++) {
        const prevDay = new Date(sortedDays[i-1]);
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
      if (maxStreak >= 7 && !earnedTypes.has('scripture-streak-7')) {
        await awardAchievement(userId, 'scripture-streak-7', allAchievements);
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
    earnedTypes: Set<string>
  ) => {
    try {
      if (userPosts.length < 4) return; // Need at least 4 posts for a 4-week streak
      
      // Group posts by week to count as 1 per week
      const postsByWeek = new Map<string, boolean>();
      userPosts.forEach(post => {
        const date = new Date(post.createdAt);
        // Get the week number (approximate)
        const weekNum = Math.floor(date.getDate() / 7);
        const weekKey = `${date.getFullYear()}-${date.getMonth() + 1}-week-${weekNum}`;
        postsByWeek.set(weekKey, true);
      });
      
      // Check for consecutive weeks
      const sortedWeeks = Array.from(postsByWeek.keys()).sort();
      
      // If we have at least 4 weeks of memory verses
      if (sortedWeeks.length >= 4 && !earnedTypes.has('memory-verse-streak-4')) {
        await awardAchievement(userId, 'memory-verse-streak-4', allAchievements);
      }
    } catch (error) {
      logger.error("Error checking memory verse streak:", error);
    }
  };
  
  // Helper function to award an achievement
  const awardAchievement = async (userId: number, achievementType: string, allAchievements: any[]) => {
    try {
      // Find the matching achievement type
      const achievementTypeObj = allAchievements.find(a => a.type === achievementType);
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
          eq(userAchievements.achievementTypeId, achievementTypes.id)
        )
        .where(
          and(
            eq(userAchievements.userId, userId),
            eq(achievementTypes.type, achievementType)
          )
        );
        
      if (existingAchievement.length > 0) {
        logger.info(`User ${userId} already has achievement ${achievementType}`);
        return;
      }
      
      // Award the achievement
      const [newAchievement] = await db
        .insert(userAchievements)
        .values({
          userId: userId,
          achievementTypeId: achievementTypeObj.id,
          earnedAt: new Date(),
          viewed: false
        })
        .returning();
        
      logger.info(`Awarded achievement ${achievementType} to user ${userId}`);
      
      // Add points to user
      await db
        .update(users)
        .set({
          points: sql`${users.points} + ${achievementTypeObj.pointValue}`
        })
        .where(eq(users.id, userId));
        
      // Notify the user about the achievement
      const userSockets = clients.get(userId);
      if (userSockets && userSockets.size > 0 && userSockets.values().next().value.readyState === WebSocket.OPEN) {
        // Send the achievement notification
        const achievementData = {
          type: 'achievement',
          achievement: {
            id: newAchievement.id,
            type: achievementType,
            name: achievementTypeObj.name,
            description: achievementTypeObj.description,
            iconPath: achievementTypeObj.iconPath,
            pointValue: achievementTypeObj.pointValue
          }
        };
        
        for (const client of userSockets) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(achievementData));
          }
        }
      }
    } catch (error) {
      logger.error(`Error awarding achievement ${achievementType} to user ${userId}:`, error);
    }
  };

  // Add endpoint to process video posters in batches without blocking the main server
  router.post("/api/process-video-posters", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      logger.info(`Video poster batch processing initiated by admin user ${req.user.id}`);
      
      // Get batch parameters from request
      const batchSize = req.query.batch ? parseInt(req.query.batch as string, 10) : 20;
      const maxRunTime = req.query.timeout ? parseInt(req.query.timeout as string, 10) : 60000;
      
      // Import the generator module
      const { processPosterBatch } = await import('./poster-generator');
      
      // Send initial response that the process has started
      res.json({ 
        message: "Video poster processing started",
        status: "running",
        batchSize,
        maxRunTime,
        startedAt: new Date().toISOString()
      });
      
      // Execute the process after sending the response
      processPosterBatch(batchSize, maxRunTime)
        .then((stats) => {
          logger.info('Video poster processing completed successfully', stats);
        })
        .catch(err => {
          logger.error('Error in video poster processing:', err);
        });
    } catch (error) {
      logger.error('Error initiating video poster processing:', error);
      res.status(500).json({
        message: "Failed to initiate video poster processing",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return httpServer;
};