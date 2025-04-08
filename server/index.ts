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
import path from "path";

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

// Update the scheduleDailyScoreCheck function
const scheduleDailyScoreCheck = () => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 1, 0, 0); // 00:01 AM tomorrow

  const timeUntilCheck = tomorrow.getTime() - now.getTime();

  logger.info('Scheduling next daily score check for:', { timestamp: tomorrow.toISOString() });

  // Run an immediate check if it hasn't been run today
  const runDailyCheck = async () => {
    try {
      logger.info('Running daily score check');
      
      // Use relative URL to avoid port binding issues
      const baseUrl = 'http://localhost:5000';
      
      // Run checks for each hour to ensure notifications go out for all users
      // based on their preferred notification times
      for (let hour = 0; hour < 24; hour++) {
        logger.info(`Running check for hour ${hour}`);
        
        const response = await fetch(`${baseUrl}/api/check-daily-scores`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            currentHour: hour,
            // Use current minute for testing
            currentMinute: now.getMinutes()
          })
        });

        if (!response.ok) {
          logger.error(`Failed to run daily score check for hour ${hour}: ${response.statusText}`);
          continue; // Try next hour
        }

        const result = await response.json();
        logger.info(`Daily score check completed for hour ${hour}:`, result);
      }
      
      logger.info('Completed daily checks for all hours');
    } catch (error) {
      logger.error('Error running daily score check:', error instanceof Error ? error : new Error(String(error)));
      // Schedule a retry in 5 minutes if there's an error
      setTimeout(runDailyCheck, 5 * 60 * 1000);
    }
  };

  // Run an immediate check during startup for debugging purposes
  // This helps us verify the notification system quickly
  setTimeout(() => {
    logger.info('Running immediate daily score check for debugging...');
    runDailyCheck();
    
    // Schedule next check for tomorrow
    setTimeout(() => {
      runDailyCheck();
      // Schedule subsequent checks every 24 hours
      setInterval(runDailyCheck, 24 * 60 * 60 * 1000);
    }, timeUntilCheck);
  }, 10 * 1000); // Reduced to 10 seconds to check sooner

  // Also run a check every hour to catch notifications throughout the day
  const runHourlyCheck = async () => {
    try {
      const currentHour = new Date().getHours();
      logger.info(`Running hourly check for hour ${currentHour}`);
      
      const baseUrl = 'http://localhost:5000';
      const response = await fetch(`${baseUrl}/api/check-daily-scores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentHour,
          currentMinute: new Date().getMinutes()
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to run hourly check: ${response.statusText}`);
      }

      const result = await response.json();
      logger.info(`Hourly check completed for hour ${currentHour}:`, result);
    } catch (error) {
      logger.error('Error running hourly check:', error instanceof Error ? error : new Error(String(error)));
    }
  };
  
  // Start the hourly check after 60 seconds, then run every hour
  setTimeout(() => {
    runHourlyCheck();
    setInterval(runHourlyCheck, 60 * 60 * 1000); // Every hour
  }, 60 * 1000);

  // Log the schedule
  logger.info(`Daily score check scheduled to run in ${Math.round(timeUntilCheck / 1000 / 60)} minutes and immediate check in 10 seconds`);
  logger.info('Hourly checks will also run to ensure notifications go out at the correct times');
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

    // ALWAYS serve the app on port 5000
    const port = 5000;

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
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Server close timeout'));
            }, 10000); // Increased timeout to 10 seconds
            
            currentServer?.close(() => {
              clearTimeout(timeout);
              console.log('[Server Startup] Existing server closed');
              resolve();
            });
          }).catch(err => {
            console.warn('[Server Startup] Error closing server:', err);
            // Force close any remaining connections
            try {
              currentServer?.closeAllConnections();
            } catch (closeErr) {
              console.warn('[Server Startup] Error force closing connections:', closeErr);
            }
            currentServer = null;
          });
          currentServer = null;
        }

        // Wait longer for port to fully clear
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('[Server Startup] Starting new server...');
        return new Promise((resolve, reject) => {
          try {
            currentServer = server.listen({
              port,
              host: "0.0.0.0",
              backlog: 100,
            }, async () => {
              try {
                log(`[Server Startup] Server listening on port ${port}`);
                
                // Schedule daily checks after server is ready
                scheduleDailyScoreCheck();
                
                // Run video poster fix on startup to ensure all videos have poster files
                console.log('[Server Startup] Running automatic video poster fix...');
                const { fixVideoPosters } = await import('./fix-video-posters');
                await fixVideoPosters();
                console.log('[Server Startup] Video poster fix completed successfully');
                
                // Keep-alive configuration
                currentServer?.keepAliveTimeout = 65000; // Slightly higher than 60 second nginx default
                currentServer?.headersTimeout = 66000; // Slightly higher than keepAliveTimeout
                
                resolve(currentServer!);
              } catch (error) {
                console.error('[Server Startup] Error during server initialization:', error);
                reject(error);
              }
            });

            // Add error event handler for uncaught server errors
            currentServer.on('error', (err: any) => {
              console.error('[Server Error]:', err);
              if (err.code === 'EADDRINUSE') {
                killPort(port)
                  .catch(console.error)
                  .finally(() => {
                    console.error('[Server Startup] Port still in use, retrying...');
                    currentServer?.close();
                    reject(err);
                  });
              } else {
                reject(err);
              }
            });

            // Add connection tracking
            currentServer.on('connection', (socket) => {
              socket.setKeepAlive(true, 60000);
              socket.setTimeout(120000);
            });

          } catch (err) {
            console.error('[Server Startup] Critical error starting server:', err);
            reject(err);
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
// API endpoint for user authentication
app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }
    res.json(req.user);
  });