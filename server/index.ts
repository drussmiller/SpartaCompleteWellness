import { sql } from "drizzle-orm";
import express, { type Request, Response, NextFunction } from "express";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { Server as HttpServer, createServer } from "http";
import { db } from "./db";
import { promisify } from "util";
import { exec } from "child_process";
import { logger } from "./logger";
import path from "path";
import { WebSocketServer } from 'ws'; // Added import for WebSocketServer

const execAsync = promisify(exec);

const app = express();

// Increase timeouts and add keep-alive
const serverTimeout = 14400000; // 4 hours
app.use((req, res, next) => {
  // Set keep-alive header with increased timeout
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=14400');

  // Increase socket timeout and add connection handling
  if (req.socket) {
    req.socket.setKeepAlive(true, 60000); // Keep-alive probe every 60 seconds
    req.socket.setTimeout(serverTimeout);
    req.socket.setNoDelay(true); // Disable Nagle's algorithm
  }

  // Set generous timeouts
  req.setTimeout(serverTimeout);

  res.setTimeout(serverTimeout, () => {
    res.status(408).send('Request timeout');
  });
  next();
});

// Increase body parser limits
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Body parser middleware already defined above

// Setup auth first (includes session middleware)
setupAuth(app);

// Add request logging middleware
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
    if (path.includes('/api/posts/comments/') || 
        path.includes('/api/posts/counts') || 
        req.path === '/api/posts') {
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

// Update the scheduleDailyScoreCheck function with more error handling
const scheduleDailyScoreCheck = () => {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0); // 00:01 AM tomorrow

    const timeUntilCheck = tomorrow.getTime() - now.getTime();

    logger.info('Scheduling next daily score check for:', { timestamp: tomorrow.toISOString() });

    // Run an immediate check if it hasn't been run today, with better error handling
    const runDailyCheck = async () => {
      try {
        logger.info('Running daily score check');

        // Use the same port as the server is running on
        const port = process.env.PORT ? process.env.PORT : 3000;
        const baseUrl = `http://localhost:${port}`;

        // Only run check for current hour to reduce overhead
        const currentHour = new Date().getHours();
        logger.info(`Running check for hour ${currentHour}`);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const response = await fetch(`${baseUrl}/api/check-daily-scores`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              currentHour,
              currentMinute: new Date().getMinutes()
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) {
            logger.error(`Failed to run daily score check for hour ${currentHour}: ${response.statusText}`);
            return;
          }

          const result = await response.json();
          logger.info(`Daily score check completed for hour ${currentHour}:`, result);
        } catch (fetchError) {
          logger.error(`Error fetching daily score check for hour ${currentHour}:`, 
            fetchError instanceof Error ? fetchError : new Error(String(fetchError)));
        }

        logger.info('Completed daily check');
      } catch (error) {
        logger.error('Error running daily score check:', 
          error instanceof Error ? error : new Error(String(error)));
      }
    };

    // Setup function for scheduling periodic checks
    const scheduleChecks = () => {
      // Skip immediate check to reduce startup load
      // Schedule next check for tomorrow
      setTimeout(() => {
        try {
          runDailyCheck();
          // Schedule subsequent checks every 24 hours
          setInterval(() => {
            try {
              runDailyCheck();
            } catch (error) {
              logger.error('Error in daily check interval:', error);
            }
          }, 24 * 60 * 60 * 1000);
        } catch (error) {
          logger.error('Error scheduling daily check:', error);
        }
      }, timeUntilCheck);
    };

    // Schedule the daily check
    scheduleChecks();

    // Log the schedule
    logger.info(`Daily score check scheduled to run in ${Math.round(timeUntilCheck / 1000 / 60)} minutes`);
  } catch (error) {
    logger.error('Error in scheduleDailyScoreCheck:', error);
  }
};

// Ensure API requests respond with JSON
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Remove the placeholder route since the real endpoint is in routes.ts
// We'll directly call the endpoint in routes.ts


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


    // Serve uploads directory as static files
    const uploadsPath = path.join(process.cwd(), 'uploads');
    console.log("[Startup] Setting up static uploads directory:", uploadsPath);
    app.use('/uploads', express.static(uploadsPath, {
      // Set maximum cache age to 1 day
      maxAge: '1d',
      // Don't transform paths
      fallthrough: false,
      // Return 404 if file not found
      redirect: false
    }));

    // Setup Vite or static files AFTER API routes
    if (app.get("env") === "development") {
      console.log("[Startup] Setting up Vite...");
      await setupVite(app, server);
      console.log("[Startup] Vite setup complete", Date.now() - startTime, "ms");
    } else {
      serveStatic(app);
    }

    await runMigrations();

    // Use Replit's standard port (3000)
    // This is the only port we should be using to avoid conflicts
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

    // Disable console logging
    logger.setConsoleOutputEnabled(false);

    // Enhanced port cleanup function with detailed logging
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

    // Enhanced server cleanup and startup mechanism
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

        console.log('[Server Startup] Starting new server...');
        // Create HTTP server with increased timeouts
        currentServer = createServer(app);
        currentServer.keepAliveTimeout = 65000; // Slightly higher than 60 second nginx default
        currentServer.headersTimeout = 66000; // Slightly higher than keepAliveTimeout

        // WebSocket server is created in routes.ts, we don't need to create it here
        // This prevents having multiple WebSocket servers trying to bind to the same path


        // Set up server error handler
        currentServer.on('error', (err: any) => {
          console.error('[Server Error]:', err);
          if (err.code === 'EADDRINUSE') {
            console.log('[Server Error] Port in use, attempting cleanup...');
            killPort(port)
              .catch(console.error)
              .finally(() => {
                console.error('[Server Error] Please try restarting the server');
                process.exit(1);
              });
          }
        });

        // Add listener for successful startup
        currentServer.once('listening', async () => {
          log(`[Server Startup] Server listening on port ${port}`);

          // Schedule daily checks after server is ready
          scheduleDailyScoreCheck();

          // Run video poster fix on startup, but don't block server operation
          setTimeout(async () => {
            try {
              console.log('[Server Startup] Running automatic video poster fix...');
              
              // Set up a timeout to ensure the function doesn't hang
              const posterFixPromise = (async () => {
                try {
                  const { fixVideoPosters } = await import('./fix-video-posters');
                  await fixVideoPosters();
                  return 'success';
                } catch (importError) {
                  console.error('[Server Startup] Failed to import or run video poster fix:', importError);
                  return 'error';
                }
              })();
              
              // Wait for the fix to complete or timeout after 60 seconds
              const result = await Promise.race([
                posterFixPromise,
                new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 60000))
              ]);
              
              if (result === 'success') {
                console.log('[Server Startup] Video poster fix completed successfully');
              } else if (result === 'timeout') {
                console.warn('[Server Startup] Video poster fix timed out, continuing server operation');
              }
            } catch (error) {
              console.error('[Server Startup] Error during video poster fix:', error);
            }
          }, 5000); // Delay by 5 seconds to allow server to stabilize first
        });

        // Explicitly start listening on 0.0.0.0 to allow external access
        currentServer.listen(port, '0.0.0.0');
        console.log(`[Server Startup] Called listen() on port ${port} bound to 0.0.0.0`);

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

    // Handle graceful shutdown
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

    // Handle various shutdown signals
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Start server with enhanced cleanup and retry mechanism
    const serverInstance = await cleanupAndStartServer();
    // The server is already listening as part of cleanupAndStartServer

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
// API endpoint for user authentication
app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }
    res.json(req.user);
  });