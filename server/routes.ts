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
import mammoth from "mammoth";

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

  router.post("/api/activities/upload-doc", authenticate, upload.single('document'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log('Processing document:', req.file.originalname);

      // Convert the uploaded document to HTML, including the transform to extract hyperlinks
      const result = await mammoth.convertToHtml({ 
        buffer: req.file.buffer,
        transformDocument: (element) => {
          if (element.type === 'hyperlink' && element.href) {
            // Log the extracted hyperlink for debugging
            console.log('Found hyperlink:', element.href);
            return element;
          }
        }
      });

      let html = result.value;

      console.log('Initial HTML content:', html.substring(0, 200) + '...');

      // Extract and transform YouTube links into embeds (handle both direct URLs and hyperlinked text)
      const youtubeRegex = /(?:href=")?(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:")?/g;
      html = html.replace(youtubeRegex, (match, videoId) => {
        console.log('Found YouTube video ID:', videoId);
        return `<div class="video-wrapper"><iframe width="100%" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
      });

      // Clean up any potential script tags or other unsafe content
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      // Add proper spacing between elements
      html = html.replace(/><\/p>/g, '>&nbsp;</p>');
      html = html.replace(/\n/g, '<br>');

      // Ensure proper video wrapper styling
      html = `${html}
      <style>
        .video-wrapper {
          position: relative;
          padding-bottom: 56.25%;
          height: 0;
          margin: 1rem 0;
        }
        .video-wrapper iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
      </style>`;

      console.log('Final processed content:', html.substring(0, 200) + '...');

      res.json({ content: html });
    } catch (error) {
      console.error('Error processing document:', error);
      res.status(500).json({ 
        message: "Failed to process document",
        error: error instanceof Error ? error.message : undefined
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