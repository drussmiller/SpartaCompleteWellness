import type { Express } from "express";
import { createServer, type Server } from "http";

export async function registerRoutes(app: Express): Promise<Server> {
  // Basic test endpoint with enhanced logging
  app.get("/ping", (req, res) => {
    console.log('Ping request received from:', req.ip);
    res.send('pong');
  });

  // Create HTTP server
  console.log('[Routes] Creating HTTP server...');
  const httpServer = createServer(app);
  console.log('[Routes] HTTP server created');

  return httpServer;
}