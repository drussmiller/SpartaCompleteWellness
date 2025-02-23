import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertMeasurementSchema, insertPostSchema, insertTeamSchema, insertNotificationSchema, type InsertPost } from "@shared/schema";
import { ZodError } from "zod";
import { WebSocketServer, WebSocket } from 'ws';

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

      const postData: InsertPost = {
        ...insertPostSchema.parse(req.body),
        userId: req.user.id,
      };

      console.log('Validated post data:', postData);

      const post = await storage.createPost(postData);
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

  // Measurements
  app.post("/api/measurements", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const measurement = await storage.createMeasurement({
        ...insertMeasurementSchema.parse(req.body),
        userId: req.user.id,
      });
      res.status(201).json(measurement);
    } catch (e) {
      if (e instanceof ZodError) {
        res.status(400).json(e.errors);
      } else {
        throw e;
      }
    }
  });

  app.get("/api/measurements", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const measurements = await storage.getMeasurementsByUser(req.user.id);
    res.json(measurements);
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