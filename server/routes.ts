import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { db } from "./db";
import { queryClient } from "../client/src/lib/queryClient";
import { eq, desc, sql } from "drizzle-orm";
import { posts, notifications, videos, users, teams } from "@shared/schema";
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

  app.patch("/api/teams/:id", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);

    try {
      const teamId = parseInt(req.params.id);
      const { name, description } = req.body;

      // Check if team exists
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId));

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Update team
      const [updatedTeam] = await db
        .update(teams)
        .set({ name, description })
        .where(eq(teams.id, teamId))
        .returning();

      res.json(updatedTeam);
    } catch (error) {
      console.error('Error updating team:', error);
      res.status(500).json({
        message: "Failed to update team",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.delete("/api/teams/:id", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);

    try {
      const teamId = parseInt(req.params.id);

      // Check if team exists
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId));

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      await storage.deleteTeam(teamId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting team:', error);
      res.status(500).json({
        message: "Failed to delete team",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add this endpoint after the existing teams routes
  app.get("/api/teams/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, parseInt(req.params.id)));

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      res.json(team);
    } catch (error) {
      console.error('Error fetching team:', error);
      res.status(500).json({
        message: "Failed to fetch team",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
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
        points: postData.type === 'memory_verse' ? 10 : (postData.type === 'comment' ? 0 : 3),
        createdAt: new Date()
      });

      // Update points in database directly
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id));

      if (user) {
        await db
          .update(users)
          .set({ points: user.points + post.points })
          .where(eq(users.id, req.user.id));
      }

      console.log('Created post:', post);

      // Send notification about points earned
      if (post.type !== 'comment') {
        const notification = await sendNotification(
          req.user.id,
          "Points Earned!",
          `You earned ${post.points} points for your ${post.type} post!`
        );
        console.log('Created notification:', notification);
      }

      // Return the complete post object with all fields
      const [createdPost] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, post.id));

      res.status(201).json(createdPost);
    } catch (e) {
      console.error('Error creating post:', e);
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

  app.get("/api/posts", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      // If parentId is provided, return comments for that post
      if (req.query.parentId) {
        const comments = await storage.getPostComments(parseInt(req.query.parentId as string));
        res.json(comments);
      } else {
        // Get posts for the user's team if they have one
        let allPosts;
        if (req.user.teamId) {
          allPosts = await storage.getPostsByTeam(req.user.teamId);
        } else {
          // Otherwise return all main posts that aren't comments
          allPosts = await storage.getPosts();
        }
        res.json(allPosts);
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

      // Check if post is from a previous day
      const postDate = new Date(post.createdAt!);
      const today = new Date();
      const isFromPreviousDay = postDate.toDateString() !== today.toDateString();

      // Only allow deleting comments from previous days, or any post type from current day
      if (isFromPreviousDay && post.type !== 'comment') {
        return res.status(403).json({
          message: "Only comments can be deleted from previous days"
        });
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

  app.delete("/api/posts/all", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    try {
      await db.delete(posts);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting posts:', error);
      res.status(500).json({ error: "Failed to delete posts" });
    }
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
    try {
      // Get user with accurate point total
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          password: users.password,
          isAdmin: users.isAdmin,
          teamId: users.teamId,
          imageUrl: users.imageUrl,
          preferredName: users.preferredName,
          weight: users.weight,
          waist: users.waist,
          createdAt: users.createdAt,
          points: sql`COALESCE((
            SELECT SUM(p.points)
            FROM ${posts} p
            WHERE p.user_id = ${users.id}
            AND p.type != 'comment'
          ), 0)::integer`
        })
        .from(users)
        .where(eq(users.id, req.user.id));

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
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