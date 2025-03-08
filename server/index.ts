import { sql } from "drizzle-orm";
import express, { type Request, Response, NextFunction } from "express";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { Server as HttpServer } from "http";
import { db } from "./db";
import { promisify } from "util";
import { exec } from "child_process";
import { logger } from "./logger";

const execAsync = promisify(exec);

const app = express();

// Basic middleware setup
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Setup auth first (includes session middleware)
setupAuth(app);

// Add request logging middleware (modified from original)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    // Skip logging for comment count API requests to reduce noise
    if (path.includes('/api/posts/comments/')) {
      return;
    }

    const duration = Date.now() - start;
    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
    if (capturedJsonResponse) {
      logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
    }

    if (logLine.length > 80) {
      logLine = logLine.slice(0, 79) + "…";
    }

    log(logLine);
  });
  next();
});

// Ensure API requests respond with JSON
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

(async () => {
  try {
    console.log("[Startup] Beginning server initialization...");
    const startTime = Date.now();

    // Verify database connection
    console.log("[Startup] Verifying database connection...");
    try {
      await db.execute(sql`SELECT 1`);
      console.log("[Startup] Database connection verified", Date.now() - startTime, "ms");
    } catch (error) {
      console.error("[Startup] Database connection failed:", error);
      throw error;
    }

    // Register API routes before Vite middleware
    console.log("[Startup] Registering routes...");
    const server = await registerRoutes(app);
    console.log("[Startup] Routes registered", Date.now() - startTime, "ms");

    // Global API error handler
    app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[API Error]:', err);
      res.status(err.status || 500).json({
        message: err.message || "Internal Server Error"
      });
    });

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Express error handler:', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });


    // Setup Vite or static files AFTER API routes
    if (app.get("env") === "development") {
      console.log("[Startup] Setting up Vite...");
      await setupVite(app, server);
      console.log("[Startup] Vite setup complete", Date.now() - startTime, "ms");
    } else {
      serveStatic(app);
    }

    await runMigrations();

    // ALWAYS serve the app on port 5000
    const port = 5000;
    
    // Disable console logging
    logger.setConsoleOutputEnabled(false);

    // Enhanced port cleanup function with detailed logging (from original)
    const killPort = async (port: number): Promise<void> => {
      try {
        // Disabled console output
        // console.log(`[Port Cleanup] Attempting to kill process on port ${port}...`);

        if (process.platform === "win32") {
          const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
          console.log(`[Port Cleanup] Windows netstat output:`, stdout);
          const pidMatch = stdout.match(/\s+(\d+)\s*$/m);
          if (pidMatch && pidMatch[1]) {
            console.log(`[Port Cleanup] Found PID ${pidMatch[1]}, attempting to kill...`);
            await execAsync(`taskkill /F /PID ${pidMatch[1]}`);
          }
        } else {
          // Unix/Linux specific commands with error handling
          try {
            console.log(`[Port Cleanup] Attempting lsof cleanup...`);
            const { stdout: lsofOutput } = await execAsync(`lsof -i :${port}`);
            console.log(`[Port Cleanup] Current port status:`, lsofOutput);
            await execAsync(`lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs -r kill -9`);
          } catch (lsofError) {
            console.log(`[Port Cleanup] lsof failed, trying netstat...`, lsofError);
            try {
              await execAsync(`netstat -ltnp | grep -w ':${port}' | awk '{print $7}' | cut -d'/' -f1 | xargs -r kill -9`);
            } catch (netstatError) {
              console.log(`[Port Cleanup] netstat failed, trying fuser...`, netstatError);
              await execAsync(`fuser -k ${port}/tcp`);
            }
          }
        }

        // Verify port is free
        await new Promise(resolve => setTimeout(resolve, 2000));
        const { stdout: verifyOutput } = await execAsync(
          process.platform === "win32"
            ? `netstat -ano | findstr :${port}`
            : `lsof -i :${port}`
        );
        console.log(`[Port Cleanup] Port status after cleanup:`, verifyOutput || 'Port is free');

      } catch (error) {
        console.log(`[Port Cleanup] No active process found on port ${port}`);
      }
    };

    // Enhanced server cleanup and startup mechanism (from original, adapted)
    let currentServer: HttpServer | null = null;
    const cleanupAndStartServer = async (retries = 5, delay = 3000): Promise<HttpServer> => {
      try {
        console.log(`[Server Startup] Attempt ${6-retries} of 5`);

        // First kill any existing process on the port
        await killPort(port);

        // Close existing server if any
        if (currentServer) {
          console.log('[Server Startup] Closing existing server...');
          await new Promise<void>((resolve) => {
            currentServer?.close(() => {
              console.log('[Server Startup] Existing server closed');
              resolve();
            });
          });
          currentServer = null;
        }

        console.log('[Server Startup] Waiting before starting new server...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try to start new server
        console.log(`[Server Startup] Starting server on port ${port}...`);
        currentServer = server.listen({
          port,
          host: "0.0.0.0",
        }, () => {
          log(`[Server Startup] Server listening on port ${port}`);
        });

        // Enhanced error handling
        currentServer.on('error', async (e: NodeJS.ErrnoException) => {
          console.error('[Server Error] Full error details:', {
            code: e.code,
            message: e.message,
            stack: e.stack,
            syscall: e.syscall,
            port: e.port
          });

          if (e.code === 'EADDRINUSE' && retries > 0) {
            console.log(`[Server Error] Port ${port} is in use, retrying in ${delay}ms...`);
            await killPort(port);
            await new Promise(resolve => setTimeout(resolve, delay));
            return cleanupAndStartServer(retries - 1, delay * 2);
          } else {
            console.error('[Server Error] Fatal error:', e);
            process.exit(1);
          }
        });

        return currentServer;
      } catch (error) {
        console.error('[Server Error] Error during startup:', error);
        if (retries > 0) {
          console.log(`[Server Startup] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return cleanupAndStartServer(retries - 1, delay * 2);
        }
        throw error;
      }
    };

    // Handle graceful shutdown (from original)
    const gracefulShutdown = () => {
      console.log('[Server Shutdown] Received shutdown signal. Closing HTTP server...');
      if (currentServer) {
        currentServer.close(() => {
          console.log('[Server Shutdown] HTTP server closed');
          process.exit(0);
        });

        // Force close after 5s
        setTimeout(() => {
          console.error('[Server Shutdown] Could not close connections in time, forcefully shutting down');
          process.exit(1);
        }, 5000);
      } else {
        process.exit(0);
      }
    };

    // Handle various shutdown signals (from original)
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Start server with enhanced cleanup and retry mechanism
    await cleanupAndStartServer();

  } catch (error) {
    console.error("[Server Fatal] Failed to start server:", error);
    process.exit(1);
  }
})();

async function runMigrations() {
  console.log("Running database migrations...");
  try {
    const { runMigrations: executeMigrations } = await import("./db/migrations");
    await executeMigrations();
    console.log("Migrations complete.");
  } catch (error) {
    console.error("Error running migrations:", error);
    throw error;
  }
}
// Serve static files
app.use(express.static("client/dist"));
app.use('/uploads', express.static('uploads'));