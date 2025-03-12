import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte, or, isNull, lt } from "drizzle-orm";
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
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
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

      logger.info('Post count query parameters:', {
        userId: req.user.id,
        startTime: queryStartTime.toISOString(),
        endTime: queryEndTime.toISOString(),
        tzOffset
      });

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

      logger.info('Post counts raw result:', result);

      // Initialize counts with zeros
      const counts = {
        food: 0,
        workout: 0,
        scripture: 0,
        memory_verse: 0
      };

      // Update counts from query results
      result.forEach(row => {
        if (row.type in counts) {
          counts[row.type as keyof typeof counts] = Number(row.count);
        }
      });

      logger.info('Calculated counts:', counts);

      // Define maximum posts allowed per type
      const maxPosts = {
        food: 3,
        workout: 1,
        scripture: 1,
        memory_verse: 1
      };

      // Calculate remaining posts for each type
      const remaining = {
        food: Math.max(0, maxPosts.food - counts.food),
        workout: Math.max(0, maxPosts.workout - counts.workout),
        scripture: Math.max(0, maxPosts.scripture - counts.scripture),
        memory_verse: Math.max(0, maxPosts.memory_verse - counts.memory_verse)
      };

      logger.info('Remaining posts:', remaining);

      // Calculate if user can post for each type
      const isSaturday = userDate.getDay() === 6;
      const canPost = {
        food: counts.food < maxPosts.food,
        workout: counts.workout < maxPosts.workout,
        scripture: counts.scripture < maxPosts.scripture,
        memory_verse: isSaturday && counts.memory_verse < maxPosts.memory_verse
      };

      logger.info('Can post status:', canPost);

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

  // Post creation endpoint
  router.post("/api/posts", authenticate, upload.single('image'), async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      logger.info("\n=== Comment/Post Creation Debug ===");
      logger.info("Raw request body:", req.body);
      logger.info("Current user:", req.user.id);

      let postData = req.body;
      if (typeof postData.data === 'string') {
        try {
          postData = JSON.parse(postData.data);
          logger.info("Parsed form data:", postData);
        } catch (parseError) {
          logger.error("Error parsing post data:", parseError);
          return res.status(400).json({ message: "Invalid post data format" });
        }
      }

      // Validate required fields
      const hasImage = req.file !== undefined;
      const isEmptyContentAllowed = hasImage && (postData.type === 'food' || postData.type === 'workout');

      if (!postData.type) {
        logger.error("Missing post type");
        return res.status(400).json({ message: "Post type is required" });
      }

      // Allow empty content for food and workout posts with images
      if (!isEmptyContentAllowed && (!postData.content || !postData.content.trim())) {
        logger.error("Missing required content:", { type: postData.type, content: postData.content, hasImage });
        return res.status(400).json({ message: "Content is required" });
      }


      // For comments, validate additional required fields
      if (postData.type === "comment") {
        if (!postData.parentId) {
          logger.error("Missing parentId for comment:", postData);
          return res.status(400).json({ message: "Parent post ID is required for comments" });
        }

        logger.info("Creating comment with data:", {
          userId: req.user.id,
          type: postData.type,
          content: postData.content,
          parentId: postData.parentId,
          depth: postData.depth || 0
        });

        try {
          const post = await storage.createComment({
            userId: req.user.id,
            content: postData.content.trim(),
            parentId: postData.parentId,
            depth: postData.depth || 0
          });
          logger.info("Comment created successfully:", post);
          res.status(201).json(post);
        } catch (dbError) {
          logger.error("Database error creating comment:", {
            error: dbError,
            stack: dbError instanceof Error ? dbError.stack : undefined
          });
          throw dbError;
        }
      } else {
        // Handle regular post creation
        logger.info("Creating post with data:", {
          userId: req.user.id,
          type: postData.type,
          content: postData.content,
          imageUrl: req.file ? `/uploads/${req.file.filename}` : null
        });

        try {
          const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
          console.log("Image URL for new post:", imageUrl);

          const post = await storage.createPost({
            userId: req.user.id,
            type: postData.type,
            content: postData.content.trim(),
            imageUrl: imageUrl,
            createdAt: postData.createdAt ? new Date(postData.createdAt) : new Date()
          });
          logger.info("Post created successfully:", post);
          res.status(201).json(post);
        } catch (dbError) {
          logger.error("Database error creating post:", {
            error: dbError,
            stack: dbError instanceof Error ? dbError.stack : undefined
          });
          throw dbError;
        }
      }
    } catch (error) {
      logger.error("Error in post/comment creation:", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to create post/comment",
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

  // Comments endpoints
  router.get("/api/posts/comments/:postId", authenticate, async (req, res) => {
    try {
      logger.info("\n=== Comment Endpoint Debug ===");
      logger.info("Request params:", req.params);
      logger.info("User:", req.user?.id);

      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        logger.info("Invalid post ID:", req.params.postId);
        return res.status(400).json({ message: "Invalid post ID" });
      }

      logger.info("Fetching comments for post", postId);

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

      logger.info("Executing direct comments query:", directCommentsQuery.toSQL());
      const directComments = await directCommentsQuery;
      logger.info(`Found ${directComments.length} direct comments`);

      // Then, get all replies to any comment in this thread
      // This includes replies to direct comments and replies to replies
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

        logger.info("Executing replies query:", repliesQuery.toSQL());
        const replies = await repliesQuery;
        logger.info(`Found ${replies.length} replies to comments`);

        // Add replies to the result
        allComments = [...directComments, ...replies];
      }

      logger.info(`Returning ${allComments.length} total comments and replies`);
      logger.info("Comments data:", JSON.stringify(allComments, null, 2));

      res.json(allComments);
    } catch (error) {
      logger.error("=== Comment Endpoint Error ===");
      logger.error("Error details:", error);
      res.status(500).json({
        message: "Failed to fetch comments",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get original post endpoint
  router.get("/api/posts/:postId", authenticate, async (req, res) => {
    try {
      logger.info("\n=== Post Fetch Debug ===");
      logger.info("Request params:", req.params);
      logger.info("User:", req.user?.id);

      if (!req.params.postId || req.params.postId === 'undefined') {
        logger.info("Missing post ID");
        return res.status(400).json({ message: "No post ID provided" });
      }

      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        logger.info("Invalid post ID:", req.params.postId);
        return res.status(400).json({ message: "Invalid post ID" });
      }

      logger.info("Fetching post", postId);

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

      logger.info("Executing query:", query.toSQL());
      const [post] = await query;

      if (!post) {
        logger.info("No post found");
        return res.status(404).json({ message: "Post not found" });
      }

      logger.info("Found post:", post);
      res.json(post);
    } catch (error) {
      logger.error("=== Post Fetch Error ===");
      logger.error("Error details:", error);
      res.status(500).json({
        message: "Failed to fetch post",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Posts endpoints
  router.get("/api/posts", authenticate, async (req, res) => {
    try {
      logger.info('Fetching posts for user:', req.user?.id);

      // Get posts from database with error handling
      let posts = [];
      try {
        posts = await storage.getAllPosts();
        logger.info('Raw posts count:', posts ? posts.length : 0);
      } catch (err) {
        logger.error('Error in storage.getAllPosts():', err);
        return res.status(500).json({
          message: "Failed to fetch posts from database",
          error: err instanceof Error ? err.message : "Unknown database error"
        });
      }

      if (!posts || !Array.isArray(posts)) {
        logger.error('Posts is not an array:', posts);
        return res.status(500).json({
          message: "Invalid posts data from database",
          error: "Expected array of posts but got " + typeof posts
        });
      }

      // For each post, get its author information with separate error handling
      const postsWithAuthors = await Promise.all(posts.map(async (post) => {
        if (!post || typeof post !== 'object') {
          logger.error('Invalid post object:', post);
          return null;
        }

        try {
          const author = await storage.getUser(post.userId);
          return {
            ...post,
            author: author || null
          };
        } catch (userErr) {
          logger.error(`Error fetching author for post ${post.id}:`, userErr);
          return {
            ...post,
            author: null
          };
        }
      }));

      // Filter out any null entries
      const validPosts = postsWithAuthors.filter(post => post !== null);

      logger.info('Successfully fetched posts with authors:', validPosts.length);
      res.json(validPosts);
    } catch (error) {
      logger.error('Error fetching posts:', error);
      res.status(500).json({
        message: "Failed to fetch posts",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add this endpoint after the other post-related endpoints
  router.patch("/api/posts/:id", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        logger.error('Invalid post ID:', req.params.id);
        return res.status(400).json({ message: "Invalid post ID" });
      }

      logger.info('Update request for post:', {
        postId,
        userId: req.user.id,
        content: req.body.content
      });

      // Get the post to check ownership
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);

      if (!post) {
        logger.error('Post not found:', postId);
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if user is admin or the post owner
      if (!req.user.isAdmin && post.userId !== req.user.id) {
        logger.error('Unauthorized edit attempt:', {
          userId: req.user.id,
          postUserId: post.userId,
          isAdmin: req.user.isAdmin
        });
        return res.status(403).json({ message: "Not authorized to edit this post" });
      }

      // Validate content
      if (!req.body.content || typeof req.body.content !== 'string' || !req.body.content.trim()) {
        logger.error('Invalid content:', req.body.content);
        return res.status(400).json({ message: "Content cannot be empty" });
      }

      logger.info("Updating post with data:", {
        id: postId,
        content: req.body.content.trim()
      });

      try {
        // Update post in database
        const [updatedPost] = await db
          .update(posts)
          .set({
            content: req.body.content.trim()
          })
          .where(eq(posts.id, postId))
          .returning();

        logger.info("Post updated successfully:", updatedPost);
        res.json(updatedPost);
      } catch (dbError) {
        logger.error("Database error during update:", {
          error: dbError,
          stack: dbError instanceof Error ? dbError.stack : undefined
        });
        throw dbError;
      }
    } catch (error) {
      logger.error("Error updating post:", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({
        message: "Failed to update post",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Post counts endpoint is now defined at the top of the file to avoid route conflicts

  // Delete post endpoint - optimized version with better error handling
  router.delete("/api/posts/:postId", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        logger.error(`Invalid post ID format: ${req.params.postId}`);
        return res.status(400).json({ message: "Invalid post ID" });
      }

      logger.info(`Starting deletion process for post ${postId} by user ${req.user.id}`);

      // Delete post and all related data in a single transaction with optimized queries
      try {
        await db.transaction(async (tx) => {
          // First check if post exists and user has permission
          const [post] = await tx
            .select()
            .from(posts)
            .where(eq(posts.id, postId))
            .limit(1);

          if (!post) {
            logger.warn(`Post ${postId} not found during deletion attempt`);
            throw new Error("Post not found");
          }

          if (!req.user.isAdmin && post.userId !== req.user.id) {
            logger.warn(`Unauthorized deletion attempt for post ${postId} by user ${req.user.id}`);
            throw new Error("Not authorized to delete this post");
          }

          logger.info(`Deleting reactions andcomments for post ${postId}`);

          //          // Delete reactions and comments in parallel using Promise.all
          await Promise.all([
            // Delete all reactions
            tx.delete(reactions)
              .where(eq(reactions.postId, postId))
              .then(() => logger.info(`Reactions deleted for post ${postId}`))
              .catch(error => {
                logger.error(`Error deleting reactions for post ${postId}:`, error);
                throw error;
              }),

            // Delete all comments
            tx.delete(posts)
              .where(eq(posts.parentId, postId))
              .then(() => logger.info(`Comments deleted for post ${postId}`))
              .catch(error => {
                logger.error(`Error deleting comments for post ${postId}:`, error);
                throw error;
              })
          ]);

          // Finally delete the post itself
          const [deletedPost] = await tx
            .delete(posts)
            .where(eq(posts.id, postId))
            .returning();

          if (!deletedPost) {
            logger.error(`Failed to delete main post ${postId}`);
            throw new Error("Failed to delete post");
          }

          logger.info(`Successfully deleted post ${postId} and all related data`);
        });

        res.status(200).json({ message: "Post deleted successfully" });
      } catch (txError) {
        // Handle specific transaction errors
        logger.error(`Transaction error during post ${postId} deletion:`, txError);

        if (txError.message === "Post not found") {
          return res.status(404).json({ message: "Post not found" });
        }
        if (txError.message === "Not authorized to delete this post") {
          return res.status(403).json({ message: "Not authorized to delete this post" });
        }

        throw txError; // Re-throw for general error handling
      }
    } catch (error) {
      logger.error('Unexpected error in delete post endpoint:', error);
      res.status(500).json({
        message: "Failed to delete post",
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  });

  // Add user role management endpoints
  router.patch("/api/users/:userId/role", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const { role, value } = req.body;
      if (!role || typeof value !== 'boolean' || !['isAdmin', 'isTeamLead'].includes(role)) {
        return res.status(400).json({ message: "Invalid role update data" });
      }

      // Update user role in database
      const [updatedUser] = await db
        .update(users)
        .set({ [role]: value })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      logger.error('Error updating user role:', error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  router.post("/api/activities/upload-doc", authenticate, upload.single('document'), async (req, res) => {
    try {
      if (!req.file) {
        logger.info('🚫 [UPLOAD] No file received');
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Step 1: Log file details
      logger.info('📁 [UPLOAD] File received:');
      logger.info('------------------------');
      logger.info(`Name: ${req.file.originalname}`);
      logger.info(`Size: ${req.file.size} bytes`);
      logger.info(`Type: ${req.file.mimetype}`);
      logger.info('------------------------');

      try {        // Step 2: Extract text
        logger.info('📝 [UPLOAD] Starting text extraction...');
        const { value } = await mammoth.extractRawText({
          buffer: req.file.buffer
        });

        // Step 3: Validate content
        if (!value) {
          logger.info('❌ [UPLOAD] No content extracted');
          return res.status(400).json({ error: "No content could be extracted" });        }

        logger.info('✅ [UPLOAD] Text extracted successfully');
        logger.info(`Length: ${value.length} characters`);

        // Step 4: Prepare response
        const response = { success: true };

        // Step 5: Send response
        logger.info('📤 [UPLOAD] Sending response:', response);
        return res.status(200).json(response);

      } catch (processingError) {
        logger.error('❌ [UPLOAD] Processing error:');
        logger.error('--------------------------------');
        logger.error('Error:', processingError.message);        logger.error('Stack:', processingError.stack);
        logger.error('------------------------');

        return res.status(500).json({
          error: "Processing failed",
          details: processingError.message
        });
      }
    } catch (error) {
      logger.error('💥 [UPLOAD] Fatal error:');
      logger.info('------------------------');
      logger.error('Error:', error.message);
      logger.error('Stack:', error.stack);
      logger.info('------------------------');

      return res.status(500).json({
        error: "Upload failed",
        details: error.message
      });
    }
  });

  router.post("/api/register", async (req, res) => {
    try {
      logger.info('Registration request body:', {
        username: req.body.username,
        email: req.body.email
      });

      // Validate the input data
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        logger.error('Validation errors:', parsed.error);
        return res.status(400).json({
          message: "Invalid registration data",
          errors: parsed.error.errors
        });
      }

      // Check if username already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.username, req.body.username))
        .limit(1);

      if (existingUser.length > 0) {
        logger.info('Registration failed: Username already exists');
        return res.status(400).json({
          message: "Username already exists"
        });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(req.body.password, salt);

      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          username: req.body.username,
          email: req.body.email,
          password: hashedPassword,
          isAdmin: false,
          isTeamLead: false,
          points: 0,
          preferredName: null,
          currentWeek: 1,
          currentDay: 1
        })
        .returning();

      logger.info('User registered successfully:', newUser.id);

      // Log the user in
      req.login(newUser, (err) => {
        if (err) {
          logger.error('Login after registration failed:', err);
          return res.status(500).json({
            message: "Registration successful but login failed",
            error: err.message
          });
        }
        res.status(201).json(newUser);
      });

    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({
        message: "Failed to create account",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Update the user delete route handler to clean up associated data
  router.delete("/api/users/:userId", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Check if trying to delete the main admin account
      const userToDelete = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userToDelete.length) {
        return res.status(404).json({ message: "User not found" });
      }

      if (userToDelete[0].username === "admin") {
        return res.status(403).json({
          message: "Cannot delete the main administrator account"
        });
      }

      // Start a transaction to ensure all related data is cleaned up
      await db.transaction(async (tx) => {
        // First delete all reactions by this user
        await tx
          .delete(reactions)
          .where(eq(reactions.userId, userId));

        // Delete all comments (posts with parentId) by this user
        await tx
          .delete(posts)
          .where(and(
            eq(posts.userId, userId),
            sql`${posts.parentId} IS NOT NULL`
          ));

        // Delete all posts by this user
        await tx
          .delete(posts)
          .where(eq(posts.userId, userId));

        // Delete all notifications for this user
        await tx
          .delete(notifications)
          .where(eq(notifications.userId, userId));

        // Finally delete the user
        await tx
          .delete(users)
          .where(eq(users.id, userId));
      });

      logger.info('User and related data deleted successfully:', userId);
      res.json({ message: "User and all related data deleted successfully" });
    } catch (error) {
      logger.error('Error deleting user:', error);
      res.status(500).json({
        message: "Failed to delete user",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add a general update endpoint for users
  router.patch("/api/users/:userId", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const updateData = req.body;
      logger.info(`Updating user ${userId} with data:`, updateData);

      // Validate required fields
      if (updateData.username !== undefined && (!updateData.username || typeof updateData.username !== 'string')) {
        return res.status(400).json({ message: "Username is required" });
      }

      if (updateData.email !== undefined && (!updateData.email || typeof updateData.email !== 'string')) {
        return res.status(400).json({ message: "Valid email is required" });
      }

      // Update user in database
      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      logger.error('Error updating user:', error);
      res.status(500).json({
        message: "Failed to update user",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Error handling middleware
  router.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('API Error:', err);
    res.status(err.status || 500).json({
      message: err.message || "Internal server error"
    });
  });

  app.use(router);

  // Create HTTP server
  const httpServer = createServer(app);

  // Log server startup
  logger.info('Server routes registered successfully');

  // Add the activity progress endpoint before the return httpServer statement
  // Remove previous timezone adjustment as it was being applied incorrectly
  router.get("/api/activities/current", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      // Get timezone offset from query params (in minutes)
      const tzOffset = parseInt(req.query.tzOffset as string) || 0;
      console.log('Timezone offset:', tzOffset, 'minutes'); 

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

      // Convert server time to user's local time
      const serverNow = new Date();
      // Adjust the time to user's timezone
      const userTime = new Date(serverNow.getTime() - (tzOffset * 60000));

      // Get start of user's day in their timezone
      const userStartOfDay = new Date(userTime);
      userStartOfDay.setHours(0, 0, 0, 0);

      // Calculate days since program start
      const msSinceStart = userStartOfDay.getTime() - programStart.getTime();
      const daysSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60 * 24));

      // Calculate week (add 1 since we start at week 1)
      const weekNumber = Math.floor(daysSinceStart / 7) + 1;

      // Get the day number in user's timezone (1-7, Monday=1)
      // First create a date object for user's current time
      const userLocalDate = new Date(userTime);
      const rawDay = userLocalDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const dayNumber = rawDay === 0 ? 7 : rawDay; // Convert Sunday from 0 to 7

      // Detailed debug logging
      console.log('Activity Debug:', {
        serverTime: serverNow.toISOString(),
        userTime: userTime.toISOString(),
        userLocalDate: userLocalDate.toString(),
        rawDay,
        dayNumber,
        tzOffset,
        timezoneHours: -tzOffset/60
      });

      res.json({
        currentWeek: weekNumber,
        currentDay: dayNumber,
        daysSinceStart,
        debug: {
          programStart: programStart.toISOString(),
          userNow: userTime.toISOString(),
          calculations: {
            daysSinceStart,
            weekCalculation: `${daysSinceStart} days = ${Math.floor(daysSinceStart / 7)} complete weeks + 1 = Week ${weekNumber}`,
            dayNumber: `Day ${dayNumber}`,
            timezone: `${-tzOffset/60} hours from UTC`
          }
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

  return httpServer;
};