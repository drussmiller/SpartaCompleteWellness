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

const execAsync = promisify(exec);

const app = express();

// Define initial port and server vars
let port: number = 5000;

// Declare scheduleDailyScoreCheck function
let scheduleDailyScoreCheck: () => void;

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

// Define the scheduleDailyScoreCheck function
scheduleDailyScoreCheck = () => {
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
      const baseUrl = `http://localhost:${port}`;

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

      const baseUrl = `http://localhost:${port}`;
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


    // Setup route for shared files from object storage
    console.log("[Startup] Setting up shared files path handler for cross-environment compatibility");
    app.use('/shared/uploads', async (req, res, next) => {
      try {
        const filePath = req.path;
        console.log(`Processing shared file request: ${filePath}`);

        // Import required modules
        const { Client } = require('@replit/object-storage');
        const fs = require('fs');

        // Check if Replit Object Storage is available
        if (!process.env.REPLIT_DB_ID) {
          console.log(`Object Storage not available, redirecting to local path`);
          return res.redirect(`/uploads${filePath}`);
        }

        // Initialize Object Storage client
        const objectStorage = new Client();
        console.log(`Object Storage client initialized`);

        // Define all possible key formats to try
        const keysToCheck = [
          `shared/uploads${filePath}`,
          `uploads${filePath}`,
          `shared${filePath}`,
          filePath.startsWith('/') ? filePath.substring(1) : filePath
        ];

        // Try to find the file with any of the keys
        console.log(`Attempting to download file using the following keys: ${JSON.stringify(keysToCheck)}`);
        let fileBuffer = null;
        let usedKey = null;

        // Try each key directly with downloadAsBytes without checking existence first
        for (const key of keysToCheck) {
          try {
            console.log(`Trying to download ${key} directly...`);
            const result = await objectStorage.downloadAsBytes(key);

            // Parse the result based on its format
            if (Buffer.isBuffer(result)) {
              console.log(`Success! Downloaded ${key} as direct Buffer`);
              fileBuffer = result;
              usedKey = key;
              break;
            } else if (typeof result === 'object' && result !== null && 'ok' in result) {
              if (result.ok === true && result.value && Buffer.isBuffer(result.value)) {
                console.log(`Success! Downloaded ${key} as Buffer in result object`);
                fileBuffer = result.value;
                usedKey = key;
                break;
              } else {
                console.log(`Download attempt for ${key} returned non-buffer or failure: ${JSON.stringify(result)}`);
              }
            }
          } catch (error) {
            console.log(`Failed to download ${key}: ${error.message}`);
            // Continue to next key
          }
        }

        // If we found and downloaded a file, serve it
        if (fileBuffer && fileBuffer.length > 0) {
          // Determine content type based on file extension
          const fileExtension = path.extname(filePath).toLowerCase();
          let contentType = 'application/octet-stream'; // default

          if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
            contentType = 'image/jpeg';
          } else if (fileExtension === '.png') {
            contentType = 'image/png';
          } else if (fileExtension === '.gif') {
            contentType = 'image/gif';
          } else if (fileExtension === '.mp4') {
            contentType = 'video/mp4';
          } else if (fileExtension === '.mov') {
            contentType = 'video/quicktime';
          } else if (fileExtension === '.svg') {
            contentType = 'image/svg+xml';
          } else if (fileExtension === '.webp') {
            contentType = 'image/webp';
          }

          console.log(`SUCCESS: Serving file ${usedKey} from Object Storage (size: ${fileBuffer.length} bytes, type: ${contentType})`);

          // Set headers and send the file
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache
          return res.send(fileBuffer);
        }

        // No longer check filesystem as requested - Object Storage only
        // Return a proper 404 response
        console.log(`File ${filePath} not found in Object Storage and no filesystem fallback as configured`);
        return res.status(404).json({
          success: false,
          message: 'File not found in Object Storage',
          path: filePath
        });

      } catch (error) {
        console.error('Error serving shared file:', error);
        next();
      }
    });

    // Replace static file serving with an Object Storage middleware
    // This ensures we never serve files from the filesystem directly
    console.log("[Startup] Setting up Object Storage-only uploads handler");
    app.use('/uploads', (req, res) => {
      // Return 404 with JSON response and redirect to Object Storage
      const filePath = req.path;
      console.log(`[Object Storage Only] Redirecting filesystem request to Object Storage: ${filePath}`);

      // Create the appropriate Object Storage URL
      const objectStorageUrl = `/api/object-storage/direct-download?key=uploads${filePath}`;

      // Send a 302 redirect to the Object Storage endpoint
      return res.redirect(302, objectStorageUrl);
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

    // Try alternative ports if 5000 is busy
    const ports = [5000, 5001, 5002, 5003];
    // Initial port already declared at the top of file

    // Handle port selection
    const findAvailablePort = async () => {
      for (const p of ports) {
        try {
          await new Promise((resolve, reject) => {
            const testServer = createServer();
            testServer.once('error', reject);
            testServer.once('listening', () => {
              testServer.close(() => resolve(true));
            });
            testServer.listen(p, '0.0.0.0');
          });
          return p;
        } catch (err) {
          logger.warn(`Port ${p} is busy, trying next port...`);
          continue;
        }
      }
      throw new Error('No available ports found');
    };

    // Find an available port before starting
    port = await findAvailablePort();
    logger.info(`Selected port ${port}`);

    // Disable console logging
    logger.setConsoleOutputEnabled(false);

    // Enhanced port cleanup function with detailed logging
    const killPort = async (port: number): Promise<void> => {
      try {
        console.log(`[Port Cleanup] Attempting to kill process on port ${port}...`);

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
            console.log(`[Port Cleanup] Attempting lsof cleanup for port ${port}...`);
            const { stdout: lsofOutput } = await execAsync(`lsof -i :${port}`);
            console.log(`[Port Cleanup] Current port status:`, lsofOutput);
            
            // Extract PIDs and kill them
            const lines = lsofOutput.split('\n').slice(1); // Skip header
            for (const line of lines) {
              if (line.trim()) {
                const parts = line.split(/\s+/);
                if (parts.length > 1) {
                  const pid = parts[1];
                  console.log(`[Port Cleanup] Killing PID ${pid}`);
                  try {
                    await execAsync(`kill -9 ${pid}`);
                  } catch (killError) {
                    console.log(`[Port Cleanup] Failed to kill PID ${pid}:`, killError);
                  }
                }
              }
            }
          } catch (lsofError) {
            console.log(`[Port Cleanup] lsof failed, trying fuser for port ${port}...`);
            try {
              await execAsync(`fuser -k ${port}/tcp 2>/dev/null || true`);
            } catch (fuserError) {
              console.log(`[Port Cleanup] fuser also failed, trying pkill...`);
              try {
                await execAsync(`pkill -f ".*${port}.*" 2>/dev/null || true`);
              } catch (pkillError) {
                console.log(`[Port Cleanup] All cleanup methods failed`);
              }
            }
          }
        }

        // Wait longer for port to be freed
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify port is free
        try {
          const { stdout: verifyOutput } = await execAsync(
            process.platform === "win32"
              ? `netstat -ano | findstr :${port}`
              : `lsof -i :${port} 2>/dev/null || echo "Port is free"`
          );
          console.log(`[Port Cleanup] Port status after cleanup:`, verifyOutput || 'Port is free');
        } catch (verifyError) {
          console.log(`[Port Cleanup] Port ${port} appears to be free now`);
        }

      } catch (error) {
        console.log(`[Port Cleanup] Error during cleanup for port ${port}:`, error);
      }
    };

    // Enhanced server cleanup and startup mechanism
    let currentServer: HttpServer | null = null;
    const cleanupAndStartServer = async (retries = 5, delay = 3000): Promise<HttpServer> => {
      try {
        console.log(`[Server Startup] Attempt ${6-retries} of 5`);

        // First kill any existing process on the port
        await killPort(port);

        // Add delay after killing port
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Close existing server if any
        if (currentServer) {
          console.log('[Server Startup] Closing existing server...');
          try {
            await new Promise<void>((resolve, reject) => {
              currentServer?.close((err) => {
                if (err) {
                  console.error('[Server Startup] Error closing server:', err);
                  reject(err);
                } else {
                  console.log('[Server Startup] Existing server closed');
                  resolve();
                }
              });
              // Force close after 5 seconds
              setTimeout(() => {
                console.log('[Server Startup] Force closing server after timeout');
                resolve();
              }, 5000);
            });
          } catch (err) {
            console.error('[Server Startup] Failed to close server gracefully:', err);
          }
          currentServer = null;
        }

        console.log(`[Server Startup] Starting new server on port ${port}...`);
        currentServer = server.listen(port, "0.0.0.0", () => {
          log(`[Server Startup] Server listening on port ${port}`);
          // Schedule daily checks after server is ready
          scheduleDailyScoreCheck();
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