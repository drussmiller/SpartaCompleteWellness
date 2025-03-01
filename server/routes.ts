import type { Express } from "express";

export async function registerRoutes(app: Express): Promise<void> {
  // Basic test endpoint with enhanced logging
  app.get("/ping", (req, res) => {
    console.log('Ping request received from:', req.ip);
    res.send('pong');
  });

  console.log('[Routes] All routes registered');
}