import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte, or, isNull, not, lt } from "drizzle-orm";
import {
  posts,
  notifications,
  users,
  teams,
  activities,
  workoutVideos,
  measurements,
  reactions,
  insertTeamSchema,
  insertPostSchema,
  insertMeasurementSchema,
  insertNotificationSchema,
  insertVideoSchema,
  insertActivitySchema,
  insertUserSchema,
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

// Configure multer for file uploads
const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

// Make sure upload directory exists
import fs from 'fs';
import path from 'path';
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multerStorage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB limit
    fieldSize: 25 * 1024 * 1024 // 25MB per field
  },
  highWaterMark: 2 * 1024 * 1024 // 2MB chunks
});

export const registerRoutes = async (app: express.Application): Promise<HttpServer> => {
  const router = express.Router();

  // Add request logging middleware
  router.use(requestLogger);

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

  // Simple ping endpoint to verify API functionality
  router.get("/api/ping", (req, res) => {
    logger.info('Ping request received', { requestId: req.requestId });
    res.json({ message: "pong" });
  });

  // Protected endpoint example
  router.get("/api/protected", authenticate, (req, res) => {
    res.json({ message: "This is a protected endpoint", user: req.user?.id });
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
  router.post("/api/posts", authenticate, upload.single('image'), async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      let postData = req.body;
      if (typeof postData.data === 'string') {
        try {
          postData = JSON.parse(postData.data);
        } catch (parseError) {
          logger.error("Error parsing post data:", parseError);
          return res.status(400).json({ message: "Invalid post data format" });
        }
      }

      // Calculate points based on post type
      let points = 0;
      switch (postData.type) {
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
        case 'miscellaneous':
        default:
          points = 0;
      }

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

        const post = await storage.createComment({
          userId: req.user.id,
          content: postData.content.trim(),
          parentId: postData.parentId,
          depth: postData.depth || 0
        });
        return res.status(201).json(post);
      }

      // Handle regular post creation
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

      // If there's an image, resize it for thumbnails
      if (req.file) {
        import('./middleware/image-resize').then(({ resizeUploadedImage }) => {
          resizeUploadedImage(req.file!.path).catch(err => {
            logger.error('Error during image resize:', err);
          });
        }).catch(err => {
          logger.error('Error importing image resize module:', err);
        });
      }

      const post = await storage.createPost({
        userId: req.user.id,
        type: postData.type,
        content: postData.content?.trim() || '',
        imageUrl: imageUrl,
        points: points, // Use calculated points
        createdAt: postData.createdAt ? new Date(postData.createdAt) : new Date()
      });

      res.status(201).json(post);
    } catch (error) {
      logger.error("Error in post creation:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to create post",
        error: error instanceof Error ? error.stack : "Unknown error"
      });
    }
  });

  // Add this endpoint before the return httpServer statement
  router.delete("/api/posts/:id", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
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

      // Check if user is admin or the post owner
      if (!req.user.isAdmin && post.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }

      // Delete the post
      await db.delete(posts).where(eq(posts.id, postId));

      res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
      logger.error("Error deleting post:", error);
      res.status(500).json({
        message: "Failed to delete post",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Update daily score check endpoint
  router.post("/api/check-daily-scores", async (req, res) => {
    try {
      logger.info('Starting daily score check');

      // Get all users - no filters
      const users = await db
        .select()
        .from(users);

      logger.info(`Found ${users.length} users to check`);

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
      for (const user of users) {
        try {
          logger.info(`Processing user ${user.id} (${user.username})`);

          // Get user's posts from yesterday with detailed logging
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
                gte(posts.createdAt, yesterday),
                lt(posts.createdAt, today),
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
            const notification = {
              userId: user.id,
              title: "Daily Score Alert",
              message: `Your total points for yesterday was ${totalPoints}. You should aim for ${expectedPoints} points daily for optimal progress! Yesterday's activities: ${postTypes.join(', ') || 'none'}`,
              read: false,
              createdAt: new Date()
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
      const programStart = new Date('2025-02-24T00:00:00.000Z');

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

  // Add daily points endpoint with corrected calculation
  router.get("/api/points/daily", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const userId = parseInt(req.query.userId as string);

      // Get start and end of the requested day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Calculate total points for the day
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

      const totalPoints = result[0]?.points || 0;

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
  router.post("/api/users/notification-schedule", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const { notificationTime } = req.body;

      // Validate time format (HH:mm)
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(notificationTime)) {
        return res.status(400).json({ message: "Invalid time format. Use HH:mm format." });
      }

      // Update user's notification time preference
      const [updatedUser] = await db
        .update(users)
        .set({ notificationTime })
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

  // Log server startup
  logger.info('Server routes registered successfully');

  return httpServer;
};