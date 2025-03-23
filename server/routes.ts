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
  insertUserSchema
} from "@shared/schema";
import { setupAuth, authenticate } from "./auth";
import express, { Router } from "express";
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
        food: 3,
        workout: 1,
        scripture: 1,
        memory_verse: 1,
        miscellaneous: Infinity // No limit for miscellaneous posts
      };

      // Calculate remaining posts for each type
      const remaining = {
        food: Math.max(0, maxPosts.food - counts.food),
        workout: Math.max(0, maxPosts.workout - counts.workout),
        scripture: Math.max(0, maxPosts.scripture - counts.scripture),
        memory_verse: Math.max(0, maxPosts.memory_verse - counts.memory_verse),
        miscellaneous: Infinity // Always unlimited remaining
      };

      // Calculate if user can post for each type
      const canPost = {
        food: counts.food < maxPosts.food,
        workout: counts.workout < maxPosts.workout,
        scripture: counts.scripture < maxPosts.scripture,
        memory_verse: counts.memory_verse < maxPosts.memory_verse, // Removed Saturday restriction
        miscellaneous: true // Always allow miscellaneous posts
      };

      res.json({ counts, canPost, remaining, maxPosts });
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
  router.use('/api', (err, req, res, next) => {
    logger.error('API Error:', err);
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        message: err.message || "Internal server error",
        error: process.env.NODE_ENV === 'production' ? undefined : err.stack
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
          points = 3;
          break;
        case 'workout':
          points = 3;
          break;
        case 'scripture':
          points = 3;
          break;
        case 'memory_verse':
          points = 10;
          break;
        case 'miscellaneous':
        default:
          points = 0; // Explicitly set miscellaneous and unknown types to 0 points
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

  // Add reactions endpoints
  router.post("/api/posts/:postId/reactions", authenticate, async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const postId = parseInt(req.params.postId);
      const { type } = req.body;

      const reactionData = {
        userId: req.user.id,
        postId,
        type
      };

      const reaction = await storage.createReaction(reactionData);
      res.status(201).json(reaction);
    } catch (error) {
      logger.error('Error creating reaction:', error);
      res.status(500).json({ error: "Failed to create reaction" });
    }
  });

  router.delete("/api/posts/:postId/reactions/:type", authenticate, async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const postId = parseInt(req.params.postId);
      const { type } = req.params;

      await storage.deleteReaction(req.user.id, postId, type);
      res.sendStatus(200);
    } catch (error) {
      logger.error('Error deleting reaction:', error);
      res.status(500).json({ error: "Failed to delete reaction" });
    }
  });

  router.get("/api/posts/:postId/reactions", authenticate, async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const postId = parseInt(req.params.postId);
      const reactions = await storage.getReactionsByPost(postId);
      res.json(reactions);
    } catch (error) {
      logger.error('Error fetching reactions:', error);
      res.status(500).json({ error: "Failed to fetch reactions" });
    }
  });

  // Delete comment endpoint
  router.delete("/api/posts/comments/:commentId", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const commentId = parseInt(req.params.commentId);
      if (isNaN(commentId)) {
        return res.status(400).json({ message: "Invalid comment ID" });
      }

      // Get the comment to check ownership
      const [comment] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, commentId))
        .limit(1);

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Check if user is admin or the comment owner
      if (!req.user.isAdmin && comment.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this comment" });
      }

      // Delete the comment
      await db.delete(posts).where(eq(posts.id, commentId));
      res.status(200).json({ message: "Comment deleted successfully" });
    } catch (error) {
      logger.error("Error deleting comment:", error);
      res.status(500).json({
        message: "Failed to delete comment",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Comments endpoints
  router.get("/api/posts/comments/:postId", authenticate, async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      // First, get direct comments for this post
      const directCommentsQuery = db
        .select({
          id: posts.id,
          userId: posts.userId,
          type: posts.type,
          content: posts.content,
          imageUrl: posts.imageUrl,
          points: posts.points,
          createdAt: posts.createdAt,
          parentId: posts.parentId,
          depth: posts.depth,
          author: {
            id: users.id,
            username: users.username,
            imageUrl: users.imageUrl
          }
        })
        .from(posts)
        .where(eq(posts.parentId, postId))
        .innerJoin(users, eq(posts.userId, users.id))
        .orderBy(posts.createdAt);

      const directComments = await directCommentsQuery;

      // Then, get all replies to any comment in this thread
      const commentIds = directComments.map(comment => comment.id);
      let allComments = [...directComments];

      if (commentIds.length > 0) {
        const repliesQuery = db
          .select({
            id: posts.id,
            userId: posts.userId,
            type: posts.type,
            content: posts.content,
            imageUrl: posts.imageUrl,
            points: posts.points,
            createdAt: posts.createdAt,
            parentId: posts.parentId,
            depth: posts.depth,
            author: {
              id: users.id,
              username: users.username,
              imageUrl: users.imageUrl
            }
          })
          .from(posts)
          .where(
            and(
              or(...commentIds.map(id => eq(posts.parentId, id))),
              sql`${posts.id} <> ${postId}` // Ensure we don't get the original post
            )
          )
          .innerJoin(users, eq(posts.userId, users.id))
          .orderBy(posts.createdAt);

        const replies = await repliesQuery;

        // Add replies to the result
        allComments = [...directComments, ...replies];
      }

      res.json(allComments);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch comments",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get original post endpoint
  router.get("/api/posts/:postId", authenticate, async (req, res) => {
    try {
      if (!req.params.postId || req.params.postId === 'undefined') {
        return res.status(400).json({ message: "No post ID provided" });
      }

      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      // Get post with full SQL query logging
      const query = db
        .select({
          id: posts.id,
          userId: posts.userId,
          type: posts.type,
          content: posts.content,
          imageUrl: posts.imageUrl,
          points: posts.points,
          createdAt: posts.createdAt,
          author: {
            id: users.id,
            username: users.username,
            imageUrl: users.imageUrl
          }
        })
        .from(posts)
        .where(eq(posts.id, postId))
        .innerJoin(users, eq(posts.userId, users.id))
        .limit(1);

      const [post] = await query;

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      res.json(post);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch post",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Posts endpoints
  router.get("/api/posts", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      logger.info('Posts request:', {
        userId: req.user.id,
        teamId: req.user.teamId,
        page,
        limit
      });

      // Get posts from database with error handling
      try {
        // First verify the team exists
        const [team] = await db
          .select()
          .from(teams)
          .where(eq(teams.id, req.user.teamId))
          .limit(1);

        if (!team) {
          logger.error(`Team ${req.user.teamId} not found for user ${req.user.id}`);
          return res.status(404).json({
            message: "Team not found - please contact your administrator"
          });
        }

        // For admins, show all posts. For regular users, show only team posts
        const postsQuery = db
          .select({
            id: posts.id,
            userId: posts.userId,
            type: posts.type,
            content: posts.content,
            imageUrl: posts.imageUrl,
            points: posts.points,
            createdAt: posts.createdAt,
            parentId: posts.parentId,
            depth: posts.depth,
            author: {
              id: users.id,
              username: users.username,
              imageUrl: users.imageUrl,
              teamId: users.teamId
            }
          })
          .from(posts)
          .innerJoin(users, eq(posts.userId, users.id))
          .where(isNull(posts.parentId));

        // Add team filter only for non-admin users
        if (!req.user.isAdmin) {
          postsQuery.where(eq(users.teamId, req.user.teamId));
        }

        const teamPosts = await postsQuery
          .orderBy(desc(posts.createdAt))
          .limit(limit)
          .offset((page - 1) * limit);

        logger.info('Posts query result:', {
          postsFound: teamPosts.length,
          teamId: req.user.teamId,
          page,
          limit
        });

        res.json(teamPosts);
      } catch (err) {
        logger.error('Error fetching team posts:', err);
        return res.status(500).json({
          message: "Failed to fetch posts - please try again later",
          error: err instanceof Error ? err.message : "Unknown database error"
        });
      }
    } catch (error) {
      logger.error('Error in posts endpoint:', error);
      res.status(500).json({
        message: "Failed to fetch posts",
        error: error instanceof Error ? error.message : "Unknown error"
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

  // Add or update the daily points endpoint
  router.get("/api/points/daily", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const date = new Date(req.query.date as string);
      const userId = parseInt(req.query.userId as string);

      if (isNaN(userId) || !date) {
        return res.status(400).json({ message: "Invalid date or user ID" });
      }

      // Get start and end of the requested date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Get individual posts to verify the calculation
      const userPosts = await db
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
            lte(posts.createdAt, endOfDay),
            not(eq(posts.type, 'comment')), // Exclude comments
            not(eq(posts.type, 'miscellaneous')), // Exclude miscellaneous posts from points
            not(isNull(posts.points)) // Ensure we only count posts with points
          )
        );

      logger.info('Posts for daily points calculation:', {
        userId,
        date: date.toISOString(),
        posts: userPosts.map(p => ({
          type: p.type,
          points: p.points,
          createdAt: p.createdAt
        }))
      });

      // Calculate total points manually to ensure accuracy
      const totalPoints = userPosts.reduce((sum, post) => sum + (post.points || 0), 0);

      res.json({ points: totalPoints });
    } catch (error) {
      logger.error('Error calculating daily points:', error);
      res.status(500).json({
        message: "Failed to calculate daily points",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Update daily score check endpoint
  router.post("/api/check-daily-scores", async (req, res) => {
    try {
      // Get all users
      const users = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.isAdmin, false),
            not(isNull(users.teamId))
          )
        );

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Special handling for Sunday - check memory verse completion
      if (today.getDay() === 0) {
        logger.info('Checking memory verse completion for the week');

        // Get start of week (previous Monday)
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate()- 6); // Go back 6 days to get to Monday
        startOfWeek.setHours(0, 0, 0, 0);

        // Process each user
        for (const user of users) {
          // Check if user has posted a memory verse this week
          const memoryVersePosts = await db
            .select()
            .from(posts)
            .where(
              and(
                eq(posts.userId, user.id),
                eq(posts.type, 'memory_verse'),
                gte(posts.createdAt, startOfWeek),
                lt(posts.createdAt, today)
              )
            );

          // If no memory verse posts found, send notification
          if (memoryVersePosts.length === 0) {
            await db.insert(notifications).values({
              userId: user.id,
              title: "Memory Verse Reminder",
              message: "Don't forget to complete your memory verse for this week!",
              read: false,
              createdAt: new Date()
            });

            logger.info(`Sent memory verse reminder to user ${user.id}`);
          }
        }

        return res.json({ message: "Memory verse check completed" });
      }

      // Regular weekday score check (Monday-Saturday)
      // Process each user for daily score check
      for (const user of users) {
        // Get user's posts from yesterday, excluding memory verse posts
        const userPosts = await db
          .select({
            points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`
          })
          .from(posts)
          .where(
            and(
              eq(posts.userId, user.id),
              gte(posts.createdAt, yesterday),
              lt(posts.createdAt, today),
              not(eq(posts.type, 'memory_verse')) // Exclude memory verse posts from daily total
            )
          );

        const totalPoints = userPosts[0]?.points || 0;

        // If points are less than 15, send notification (except for Sunday)
        if (totalPoints < 15) {
          await db.insert(notifications).values({
            userId: user.id,
            title: "Daily Score Alert",
            message: `Your score for yesterday was ${totalPoints}. Aim for 15 points daily (excluding memory verse) to stay on track!`,
            read: false,
            createdAt: new Date()
          });

          logger.info(`Sent score notification to user ${user.id} for score ${totalPoints}`);
        }
      }

      res.json({ message: "Score check completed" });
    } catch (error) {
      logger.error('Error checking scores:', error);
      res.status(500).json({
        message: "Failed to check scores",
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

  // Add points endpoints
  router.get("/api/points/daily", authenticate, async (req, res) => {
    try {
      const { date, userId } = req.query;
      if (!date || !userId) {
        return res.status(400).json({ message: "Date and userId are required" });
      }

      // Convert query date to Date object
      const queryDate = new Date(date as string);
      if (isNaN(queryDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      // Create start and end of the queried day
      const startOfDay = new Date(queryDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // Query posts for the specified date and calculate total points
      const result = await db
        .select({
          totalPoints: sql<number>`coalesce(sum(${posts.points}), 0)::integer`
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, parseInt(userId as string)),
            gte(posts.createdAt, startOfDay),
            lt(posts.createdAt, endOfDay),
            isNull(posts.parentId) // Don't count comments
          )
        );

      const points = result[0]?.totalPoints || 0;
      res.json({ points });
    } catch (error) {
      logger.error('Error getting daily points:', error);
      res.status(500).json({
        message: "Failed to get daily points",
        error: error instanceof Error ? error.message : "Unknown error"
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

  app.use(router);

  // Create HTTP server
  const httpServer = createServer(app);

  // Log server startup
  logger.info('Server routes registered successfully');

  return httpServer;
};