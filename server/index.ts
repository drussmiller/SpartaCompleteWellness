import { sql } from "drizzle-orm";
import express, { type Request, Response, NextFunction } from "express";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { Server as HttpServer } from "http";
import { db } from "./db";

const app = express();

// Basic middleware setup
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Debug middleware to log all requests
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Express error handler:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

(async () => {
  try {
    console.log("[Startup] Beginning server initialization...");
    const startTime = Date.now();

    // Setup auth first (includes session middleware)
    console.log("[Startup] Setting up authentication...");
    setupAuth(app);
    console.log("[Startup] Authentication setup complete", Date.now() - startTime, "ms");

    // Simple database check
    console.log("[Startup] Verifying database connection...");
    try {
      await db.execute(sql`SELECT 1`);
      console.log("[Startup] Database connection verified", Date.now() - startTime, "ms");
    } catch (error) {
      console.error("[Startup] Database connection failed:", error);
      throw error;
    }


    // Register routes
    console.log("[Startup] Registering routes...");
    const server = await registerRoutes(app);
    console.log("[Startup] Routes registered", Date.now() - startTime, "ms");

    // Setup Vite or static files
    if (app.get("env") === "development") {
      console.log("[Startup] Setting up Vite...");
      await setupVite(app, server);
      console.log("[Startup] Vite setup complete", Date.now() - startTime, "ms");
    } else {
      serveStatic(app);
    }

    // Start server
    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
    }, () => {
      const totalTime = Date.now() - startTime;
      console.log(`[Startup] Server listening on port ${port} (startup took ${totalTime}ms)`);
    });

    // Basic error handling
    server.on('error', (error) => {
      console.error('[Server Error]:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error("[Fatal Error] Failed to start server:", error);
    process.exit(1);
  }
})();