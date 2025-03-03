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
  insertActivitySchema
} from "@shared/schema";
import { setupAuth, authenticate } from "./auth";
import express, { Router } from "express";
import { Server as HttpServer } from "http";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
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

  // Simple ping endpoint to verify API functionality
  router.get("/api/ping", (req, res) => {
    res.json({ message: "pong" });
  });

  // Protected endpoint example
  router.get("/api/protected", authenticate, (req, res) => {
    res.json({ message: "This is a protected endpoint", user: req.user?.id });
  });

  // Posts endpoints
  router.get("/api/posts", authenticate, async (req, res) => {
    try {
      console.log('Fetching posts for user:', req.user?.id);
      const posts = await storage.getAllPosts();
      console.log('Raw posts:', posts);

      // For each post, get its author information
      const postsWithAuthors = await Promise.all(posts.map(async (post) => {
        const author = await storage.getUser(post.userId);
        return {
          ...post,
          author: author || null
        };
      }));

      console.log('Successfully fetched posts with authors:', postsWithAuthors.length);
      res.json(postsWithAuthors);
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  // Create post endpoint
  router.post("/api/posts", authenticate, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { content, type, imageUrl } = req.body;
      const userId = req.user.id;

      // Validate the post data
      if (!type || !['food', 'workout', 'scripture', 'memory_verse', 'comment'].includes(type)) {
        return res.status(400).json({ message: "Invalid post type" });
      }

      // Calculate points based on post type
      let points = 0;
      switch (type) {
        case 'food':
        case 'workout':
        case 'scripture':
          points = 3;
          break;
        case 'memory_verse':
          points = 10;
          break;
        default:
          points = 0;
      }

      // Create the post
      const post = await storage.createPost({
        userId,
        content,
        type,
        imageUrl,
        points,
        createdAt: new Date(),
        parentId: null,
        depth: 0
      });

      // Get the author information
      const author = await storage.getUser(userId);

      // Return the post with author information
      res.status(201).json({
        ...post,
        author
      });

    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).json({ message: "Failed to create post" });
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

  // Get users who reacted with a specific emoji
  router.get("/api/posts/:postId/reactions/users", authenticate, async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const postId = parseInt(req.params.postId);
      const reactionType = req.query.type;

      if (!reactionType) {
        return res.status(400).json({ error: "Reaction type is required" });
      }

      const usersWhoReacted = await storage.getUsersWhoReacted(postId, reactionType);
      res.json(usersWhoReacted);
    } catch (error) {
      console.error("Error fetching users who reacted:", error);
      res.status(500).json({ error: "Failed to fetch users who reacted" });
    }
  });


  // Delete post endpoint
  router.delete("/api/posts/:id", authenticate, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const postId = parseInt(req.params.id);
      const userId = req.user.id;

      // Get all posts and find the specific one
      const posts = await storage.getAllPosts();
      const post = posts.find(p => p.id === postId);

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if user owns the post
      if (post.userId !== userId && !req.user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }

      // Delete the post
      await storage.deletePost(postId);

      res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({ message: "Failed to delete post" });
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