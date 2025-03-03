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
import { setupAuth } from "./auth";
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import type { IncomingMessage } from "http";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Keep track of connected clients
const clients = new Map<number, WebSocket>();

// WebSocket helper function to send error response
function sendError(ws: WebSocket, message: string) {
  try {
    ws.send(JSON.stringify({ type: 'error', message }));
  } catch (error) {
    console.error('Error sending error message:', error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication first
  setupAuth(app);

  // Create HTTP server
  const httpServer = createServer(app);

  // Add CORS headers for all requests including WebSocket upgrades
  app.use((req, res, next) => {
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

  // Setup WebSocket server with detailed logging
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    verifyClient: ({ origin, req }, callback) => {
      console.log('WebSocket connection attempt from origin:', origin);
      console.log('Headers:', req.headers);
      callback(true);
    }
  });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('New WebSocket connection attempt');
    console.log('Request headers:', req.headers);

    let authenticated = false;
    let userId: number | null = null;

    // Set timeout for authentication
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        console.log('WebSocket authentication timeout');
        sendError(ws, 'Authentication timeout');
        ws.close(1008, 'Authentication timeout');
      }
    }, 5000);

    try {
      // Wait for authentication message
      ws.once('message', async (message: string) => {
        try {
          console.log('Received message:', message.toString());
          const data = JSON.parse(message.toString());

          if (data.type !== 'authenticate' || !data.userId) {
            console.log('Invalid authentication message:', data);
            sendError(ws, 'Invalid authentication message');
            ws.close(1008, 'Invalid authentication message');
            return;
          }

          userId = data.userId;
          console.log('Attempting to authenticate WebSocket for user:', userId);

          // Verify user exists
          const user = await storage.getUser(userId);
          if (!user) {
            console.log('WebSocket authentication failed - user not found:', userId);
            sendError(ws, 'User not found');
            ws.close(1008, 'User not found');
            return;
          }

          authenticated = true;
          clearTimeout(authTimeout);
          console.log('WebSocket authenticated for user:', userId);
          clients.set(userId, ws);

          // Send authentication success message
          ws.send(JSON.stringify({ type: 'authenticated', userId }));
        } catch (error) {
          console.error('Error processing authentication message:', error);
          sendError(ws, 'Authentication error');
          ws.close(1008, 'Authentication error');
        }
      });

      ws.on('close', (code, reason) => {
        console.log('WebSocket closed:', { code, reason });
        if (userId) {
          console.log('Removing client for user:', userId);
          clients.delete(userId);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        if (userId) {
          clients.delete(userId);
        }
      });

    } catch (error) {
      console.error('Error in WebSocket connection handler:', error);
      sendError(ws, 'Server error');
      ws.close(1008, 'Server error');
    }
  });

  // Rest of your routes...
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Unauthenticated request to /api/user');
      return res.sendStatus(401);
    }
    console.log('Authenticated user:', req.user?.id);
    res.json(req.user);
  });

  // Add reactions endpoints
  app.post("/api/posts/:postId/reactions", async (req, res) => {
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

  app.delete("/api/posts/:postId/reactions/:type", async (req, res) => {
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

  app.get("/api/posts/:postId/reactions", async (req, res) => {
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

  return httpServer;
}