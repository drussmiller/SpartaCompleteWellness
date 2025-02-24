import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { posts, notifications, videos, users } from "@shared/schema";
import { setupAuth, hashPassword, comparePasswords } from "./auth"; // Import comparePasswords
import {
  insertMeasurementSchema,
  insertPostSchema,
  insertTeamSchema,
  insertNotificationSchema,
  insertVideoSchema
} from "@shared/schema";
import { ZodError } from "zod";
import { WebSocketServer, WebSocket } from 'ws';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Keep track of connected clients
const clients = new Map<number, WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication first
  setupAuth(app);

  // Create initial admin user
  const existingAdmin = await storage.getUserByUsername('admin');
  if (!existingAdmin) {
    await storage.createUser({
      username: 'admin',
      email: 'admin@sparta.com',
      password: await hashPassword('admin123'),
      isAdmin: true,
      points: 0,
      teamId: null,
      imageUrl: null,
    });
    console.log('Created admin user');
  }

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

      // Special handling for memory verse posts
      if (postData.type === "memory_verse") {
        const today = new Date();
        // Check if it's Saturday (6 is Saturday in JavaScript's getDay())
        if (today.getDay() !== 6) {
          return res.status(400).json({
            error: "Memory verse posts can only be created on Saturdays"
          });
        }

        // Check weekly limit
        const weeklyCount = await storage.getWeeklyPostCount(req.user.id, "memory_verse", today);
        if (weeklyCount >= 1) {
          return res.status(400).json({
            error: "You have reached your weekly limit for memory verse posts"
          });
        }
      } else {
        // Check daily post limits for other post types
        const currentCount = await storage.getPostCountByTypeAndDate(req.user.id, postData.type, new Date());

        const limits: Record<string, number> = {
          food: 3,
          workout: 1,
          scripture: 1
        };

        if (limits[postData.type] && currentCount >= limits[postData.type]) {
          return res.status(400).json({
            error: `You have reached your daily limit for ${postData.type} posts`
          });
        }
      }

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
    try {
      // If parentId is provided, return comments for that post
      if (req.query.parentId) {
        const comments = await storage.getPostComments(parseInt(req.query.parentId as string));
        res.json(comments);
      } else {
        // Otherwise return all main posts
        const posts = await storage.getAllPosts();
        res.json(posts);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ error: "Failed to fetch posts" });
    }
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

  // Add team assignment route
  app.get("/api/users", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    const users = await storage.getAllUsers();
    res.json(users);
  });

  app.post("/api/users/:id/team", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    const userId = parseInt(req.params.id);
    const { teamId } = req.body;
    const user = await storage.updateUserTeam(userId, teamId);
    res.json(user);
  });

  app.post("/api/users/:id/toggle-admin", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    const userId = parseInt(req.params.id);
    const { isAdmin } = req.body;

    try {
      await db
        .update(users)
        .set({ isAdmin })
        .where(eq(users.id, userId));

      const updatedUser = await storage.getUser(userId);
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to update admin status" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    try {
      await storage.deleteUser(parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
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

  // User
  app.get("/api/user", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const user = await storage.getUserWithTeam(req.user.id);
    res.json(user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log('Registration attempt:', { username: req.body.username, email: req.body.email });

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log('Registration failed: Username exists');
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        console.log('Registration failed: Email exists');
        return res.status(400).json({ error: "Email already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      console.log('User created successfully:', { id: user.id, username: user.username });

      req.login(user, (err) => {
        if (err) {
          console.error('Login error after registration:', err);
          return next(err);
        }
        res.status(201).json(user);
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.post("/api/users/:id/reset-password", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    try {
      const newPassword = req.body.password;
      if (!newPassword) {
        return res.status(400).json({ error: "Password is required" });
      }

      // Hash the new password using the consistent hashing function
      const hashedPassword = await hashPassword(newPassword);

      // Update the user's password
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, parseInt(req.params.id)));

      console.log('Password reset successful for user:', req.params.id);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });


  app.post("/api/user/change-password", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      console.log('Password change attempt for user:', req.user.id);
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        console.log('Missing required password fields');
        return res.status(400).json({ error: "Both current and new passwords are required" });
      }

      // Get the user's current stored password
      const user = await storage.getUser(req.user.id);
      if (!user) {
        console.log('User not found:', req.user.id);
        return res.status(404).json({ error: "User not found" });
      }

      // Verify current password
      console.log('Verifying current password');
      const isValidPassword = await comparePasswords(currentPassword, user.password);
      console.log('Password verification result:', isValidPassword);

      if (!isValidPassword) {
        console.log('Invalid current password for user:', req.user.id);
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      // Hash and update the new password
      console.log('Hashing and updating new password');
      const hashedPassword = await hashPassword(newPassword);
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, req.user.id));

      console.log('Password updated successfully for user:', req.user.id);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({ error: "Failed to change password" });
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