import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte, or } from "drizzle-orm";
import {
  posts,
  notifications,
  users,
  teams,
  activities,
  workoutVideos,
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

  // Add JSON content type header for all API routes
  router.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
  });

  // Add custom error handler for better JSON errors
  router.use('/api', (err, req, res, next) => {
    console.error('API Error:', err);
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        message: err.message || "Internal server error",
        error: process.env.NODE_ENV === 'production' ? undefined : err.stack
      });
    } else {
      next(err);
    }
  });

  // Debug middleware to log all requests
  router.use((req, res, next) => {
    console.log('Request:', {
      method: req.method,
      path: req.path,
      headers: req.headers,
      session: req.session,
      isAuthenticated: req.isAuthenticated?.() || false,
      user: req.user?.id
    });
    next();
  });

  // Simple ping endpoint to verify API functionality
  router.get("/api/ping", (req, res) => {
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
      console.error('Error fetching teams:', error);
      res.status(500).json({ message: "Failed to fetch teams" });
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
      console.log('Retrieved activities:', JSON.stringify(activities, null, 2));
      res.json(activities);
    } catch (error) {
      console.error('Error fetching activities:', error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  router.post("/api/activities", authenticate, async (req, res) => {
    try {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      console.log('Creating activity with data:', JSON.stringify(req.body, null, 2));

      const parsedData = insertActivitySchema.safeParse(req.body);
      if (!parsedData.success) {
        console.error('Validation errors:', parsedData.error.errors);
        return res.status(400).json({
          message: "Invalid activity data",
          errors: parsedData.error.errors
        });
      }

      console.log('Parsed activity data:', JSON.stringify(parsedData.data, null, 2));

      try {
        const activity = await storage.createActivity(parsedData.data);
        res.status(201).json(activity);
      } catch (dbError) {
        console.error('Database error:', dbError);
        res.status(500).json({ 
          message: "Failed to create activity in database",
          error: dbError instanceof Error ? dbError.message : "Unknown error"
        });
      }
    } catch (error) {
      console.error('Error creating activity:', error);
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

      console.log('Updating activity with data:', JSON.stringify(req.body, null, 2));

      const parsedData = insertActivitySchema.safeParse(req.body);
      if (!parsedData.success) {
        console.error('Validation errors:', parsedData.error.errors);
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
      console.error('Error updating activity:', error);
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
      console.error('Error deleting activity:', error);
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
      console.error('Error fetching users:', error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Post creation endpoint
  router.post("/api/posts", authenticate, upload.single('image'), async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      console.log("Received post creation request");
      
      if (!req.body.data) {
        return res.status(400).json({ message: "Missing post data" });
      }
      
      let postData;
      try {
        postData = JSON.parse(req.body.data);
        console.log("Parsed post data:", postData);
      } catch (parseError) {
        console.error("Error parsing post data:", parseError);
        return res.status(400).json({ message: "Invalid post data format" });
      }
      
      const post = await storage.createPost({
        userId: req.user.id,
        type: postData.type,
        content: postData.content,
        points: postData.points,
        imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
        parentId: postData.parentId || null
      });
      
      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating post:", error);
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
      console.error('Error creating reaction:', error);
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
      console.error('Error deleting reaction:', error);
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
      console.error('Error fetching reactions:', error);
      res.status(500).json({ error: "Failed to fetch reactions" });
    }
  });

  // Comment count endpoint
  router.get("/api/posts/comments/:postId", authenticate, async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      // Query comments for this post with better error handling
      try {
        const comments = await db
          .select({ id: sql`count(*)` })
          .from(posts)
          .where(eq(posts.parentId, postId))
          .limit(1);
        
        return res.json({ count: Number(comments[0]?.id || 0) });
      } catch (dbError) {
        console.error(`Database error for comment count on post ${postId}:`, dbError);
        // Return 0 count instead of error to prevent UI breakage
        return res.json({ count: 0 });
      }
    } catch (error) {
      console.error(`Error fetching comment count for post ${req.params.postId}:`, error);
      // Return 0 count instead of error to prevent UI breakage
      return res.json({ count: 0 });
    }
  });

  // Posts endpoints
  router.get("/api/posts", authenticate, async (req, res) => {
    try {
      console.log('Fetching posts for user:', req.user?.id);
      
      // Get posts from database with error handling
      let posts = [];
      try {
        posts = await storage.getAllPosts();
        console.log('Raw posts count:', posts ? posts.length : 0);
      } catch (err) {
        console.error('Error in storage.getAllPosts():', err);
        return res.status(500).json({ 
          message: "Failed to fetch posts from database",
          error: err instanceof Error ? err.message : "Unknown database error"
        });
      }
      
      if (!posts || !Array.isArray(posts)) {
        console.error('Posts is not an array:', posts);
        return res.status(500).json({ 
          message: "Invalid posts data from database",
          error: "Expected array of posts but got " + typeof posts
        });
      }

      // For each post, get its author information with separate error handling
      const postsWithAuthors = await Promise.all(posts.map(async (post) => {
        if (!post || typeof post !== 'object') {
          console.error('Invalid post object:', post);
          return null;
        }
        
        try {
          const author = await storage.getUser(post.userId);
          return {
            ...post,
            author: author || null
          };
        } catch (userErr) {
          console.error(`Error fetching author for post ${post.id}:`, userErr);
          return {
            ...post,
            author: null
          };
        }
      }));

      // Filter out any null entries
      const validPosts = postsWithAuthors.filter(post => post !== null);
      
      console.log('Successfully fetched posts with authors:', validPosts.length);
      res.json(validPosts);
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ 
        message: "Failed to fetch posts",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Delete post endpoint
  router.delete("/api/posts/:postId", authenticate, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      console.log(`Attempting to delete post ${postId} by user ${req.user.id}`);

      // Get the post to check ownership
      const post = await db
        .select()
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);

      if (!post || post.length === 0) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if user is admin or the post owner
      if (!req.user.isAdmin && post[0].userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }

      // Delete post
      await storage.deletePost(postId);
      console.log(`Post ${postId} deleted successfully`);
      res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
      console.error(`Error deleting post ${req.params.postId}:`, error);
      res.status(500).json({ 
        message: "Failed to delete post",
        error: error instanceof Error ? error.message : "Unknown error"
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
      console.error('Error updating user role:', error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  app.post("/api/activities/upload-doc", authenticate, upload.single('document'), async (req, res) => {
    try {
      if (!req.file) {
        console.log('🚫 [UPLOAD] No file received');
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Step 1: Log file details
      console.log('📁 [UPLOAD] File received:');
      console.log('------------------------');
      console.log(`Name: ${req.file.originalname}`);
      console.log(`Size: ${req.file.size} bytes`);
      console.log(`Type: ${req.file.mimetype}`);
      console.log('------------------------');

      try {
        // Step 2: Extract text
        console.log('📝 [UPLOAD] Starting text extraction...');
        const { value } = await mammoth.extractRawText({ 
          buffer: req.file.buffer 
        });

        // Step 3: Validate content
        if (!value) {
          console.log('❌ [UPLOAD] No content extracted');
          return res.status(400).json({ error: "No content could be extracted" });
        }

        console.log('✅ [UPLOAD] Text extracted successfully');
        console.log(`Length: ${value.length} characters`);

        // Step 4: Prepare response
        const response = { success: true };

        // Step 5: Send response
        console.log('📤 [UPLOAD] Sending response:', response);
        return res.status(200).json(response);

      } catch (processingError) {
        console.log('❌ [UPLOAD] Processing error:');
        console.log('------------------------');
        console.log('Error:', processingError.message);
        console.log('Stack:', processingError.stack);
        console.log('------------------------');

        return res.status(500).json({
          error: "Processing failed",
          details: processingError.message
        });
      }
    } catch (error) {
      console.log('💥 [UPLOAD] Fatal error:');
      console.log('------------------------');
      console.log('Error:', error.message);
      console.log('Stack:', error.stack);
      console.log('------------------------');

      return res.status(500).json({
        error: "Upload failed",
        details: error.message
      });
    }
  });

  router.post("/api/register", async (req, res) => {
    try {
      console.log('Registration request body:', {
        username: req.body.username,
        email: req.body.email
      });

      // Validate the input data
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        console.error('Validation errors:', parsed.error);
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
        console.log('Registration failed: Username already exists');
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

      console.log('User registered successfully:', newUser.id);

      // Log the user in
      req.login(newUser, (err) => {
        if (err) {
          console.error('Login after registration failed:', err);
          return res.status(500).json({ 
            message: "Registration successful but login failed",
            error: err.message
          });
        }
        res.status(201).json(newUser);
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ 
        message: "Failed to create account",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Error handling middleware
  router.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err);
    res.status(err.status || 500).json({
      message: err.message || "Internal server error"
    });
  });

  app.use(router);

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
};