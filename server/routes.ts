import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { posts, notifications, videos } from "@shared/schema";
import { setupAuth } from "./auth";
import {
  insertMeasurementSchema,
  insertPostSchema,
  insertTeamSchema,
  insertNotificationSchema,
  insertVideoSchema,
  type InsertPost
} from "@shared/schema";
import { ZodError } from "zod";
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from "crypto";
import { sendPasswordResetEmail } from "./email";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Keep track of connected clients
const clients = new Map<number, WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Teams
  app.post("/api/teams", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    try {
      const team = await storage.createTeam(insertTeamSchema.parse(req.body));
      res.status(201).json(team);
    } catch (e) {
      if (e instanceof ZodError) {
        res.status(400).json(e.errors);
      } else {
        throw e;
      }
    }
  });

  app.get("/api/teams", async (req, res) => {
    const teams = await storage.getTeams();
    res.json(teams);
  });

  // Posts
  app.post("/api/posts", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      console.log('Received post creation request:', req.body);

      // Validate the post data
      const postData = insertPostSchema.parse(req.body);

      // Create the post with the authenticated user's ID
      const post = await storage.createPost({
        ...postData,
        userId: req.user.id,
        createdAt: new Date()
      });

      console.log('Created post:', post);

      // Award points based on post type
      let points = 0;
      switch (post.type) {
        case "food":
        case "workout":
        case "scripture":
          points = 3;
          break;
        case "memory_verse":
          points = 10;
          break;
        case "comment":
          points = 0;
          break;
      }

      if (points > 0) {
        const updatedUser = await storage.updateUserPoints(req.user.id, points);
        console.log('Updated user points:', updatedUser);

        const notification = await sendNotification(
          req.user.id,
          "Points Earned!",
          `You earned ${points} points for your ${post.type} post!`
        );
        console.log('Created notification:', notification);
      }

      res.status(201).json(post);
    } catch (e) {
      console.error('Error creating post:', e);
      if (e instanceof ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          details: e.errors
        });
      } else {
        console.error('Unexpected error:', e);
        res.status(500).json({
          error: 'Internal Server Error',
          message: e instanceof Error ? e.message : 'Unknown error occurred'
        });
      }
    }
  });

  app.get("/api/posts", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const posts = await storage.getAllPosts();
    res.json(posts);
  });

  app.delete("/api/posts/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      // First check if the post exists and belongs to the user
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, parseInt(req.params.id)));

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (post.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }

      await storage.deletePost(parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({
        message: "Failed to delete post",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // Measurements
  app.post("/api/measurements", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      console.log('Received measurement data:', req.body);
      const measurementData = {
        ...insertMeasurementSchema.parse(req.body),
        userId: req.user.id,
        date: new Date()
      };
      console.log('Processed measurement data:', measurementData);

      const measurement = await storage.createMeasurement(measurementData);
      console.log('Created measurement:', measurement);

      res.status(201).json(measurement);
    } catch (e) {
      console.error('Error creating measurement:', e);
      if (e instanceof ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          details: e.errors
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
          message: e instanceof Error ? e.message : 'Unknown error occurred'
        });
      }
    }
  });

  app.get("/api/measurements", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const measurements = await storage.getMeasurementsByUser(req.user.id);
    res.json(measurements);
  });

  // User Image Upload
  app.post("/api/user/image", upload.single('image'), async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    console.log('File upload request received:', {
      file: req.file,
      body: req.body
    });

    if (!req.file) {
      console.log('No file received in the request');
      return res.status(400).json({ message: "No image provided" });
    }

    const imageData = req.file.buffer.toString('base64');
    const imageUrl = `data:${req.file.mimetype};base64,${imageData}`;

    try {
      const updatedUser = await storage.updateUserImage(req.user.id, imageUrl);
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user image:', error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  // Notification routes
  app.get("/api/notifications", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const notifications = await storage.getUnreadNotifications(req.user.id);
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const notification = await storage.markNotificationAsRead(parseInt(req.params.id));
    res.json(notification);
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      // First check if the notification exists and belongs to the user
      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, parseInt(req.params.id)));

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      if (notification.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this notification" });
      }

      await storage.deleteNotification(parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({
        message: "Failed to delete notification",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.delete("/api/data", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    await storage.clearData();
    res.sendStatus(200);
  });

  // Add video routes
  app.get("/api/videos", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const videos = await storage.getVideos(req.user.teamId);
      res.json(videos);
    } catch (error) {
      console.error('Error fetching videos:', error);
      res.status(500).json({
        message: "Failed to fetch videos",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/videos", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    try {
      const videoData = insertVideoSchema.parse(req.body);
      const video = await storage.createVideo(videoData);
      res.status(201).json(video);
    } catch (e) {
      console.error('Error creating video:', e);
      if (e instanceof ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          details: e.errors
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
          message: e instanceof Error ? e.message : 'Unknown error occurred'
        });
      }
    }
  });

  app.delete("/api/videos/:id", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    try {
      await storage.deleteVideo(parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting video:', error);
      res.status(500).json({
        message: "Failed to delete video",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    try {
      const { email } = req.body;

      // Generate a reset token
      const resetToken = randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      // Store the reset token in the database
      await storage.storeResetToken(email, resetToken, resetTokenExpiry);

      // Send reset email
      const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
      await sendPasswordResetEmail(email, resetLink);

      res.status(200).json({ message: "If an account exists with this email, you will receive password reset instructions." });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(200).json({ message: "If an account exists with this email, you will receive password reset instructions." });
    }
  });

  app.post("/api/reset-password/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { password } = req.body;

      // Verify token and update password
      const success = await storage.resetPassword(token, password);

      if (success) {
        res.status(200).json({ message: "Password updated successfully" });
      } else {
        res.status(400).json({ message: "Invalid or expired reset token" });
      }
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  const httpServer = createServer(app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const userId = req.url?.split('userId=')[1];
    if (userId) {
      clients.set(parseInt(userId), ws);

      ws.on('close', () => {
        clients.delete(parseInt(userId));
      });
    }
  });

  // Helper function to send notification
  async function sendNotification(userId: number, title: string, message: string) {
    try {
      const notification = await storage.createNotification({
        userId,
        title,
        message,
        read: false,
        createdAt: new Date(),
      });

      const ws = clients.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(notification));
      }

      return notification;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  return httpServer;
}