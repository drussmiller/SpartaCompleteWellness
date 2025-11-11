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
const server = createServer(app);

// Use environment PORT for deployment compatibility
const port = parseInt(process.env.PORT || "5000", 10);

// Declare scheduleDailyScoreCheck function and interval
let scheduleDailyScoreCheck: () => void;
let notificationCheckInterval: NodeJS.Timeout | null = null;
let isCheckingNotifications = false;

// Basic connection settings for deployment compatibility
app.use((req, res, next) => {
  // Set basic keep-alive header
  res.setHeader('Connection', 'keep-alive');
  next();
});

// Increase body parser limits
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Body parser middleware already defined above

// Add immediate health check endpoint before any heavy operations
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Verify database connection BEFORE setting up auth
async function verifyDatabase() {
  console.log("Verifying database connection...");
  try {
    // Test database connection
    await db.execute(sql`SELECT 1`);
    console.log("Database connection verified successfully.");
    console.log("Note: Schema is managed by Drizzle Kit. Run 'npm run db:push' to sync schema changes.");
  } catch (error) {
    console.error("Error connecting to database:", error);
    throw error;
  }
}

// Wait for database verification before continuing
await verifyDatabase();

// Setup auth after migrations complete (includes session middleware)
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
    // Skip logging for noisy endpoints and HEAD requests
    if (path.includes('/api/posts/comments/') ||
        path.includes('/api/posts/counts') ||
        req.path === '/api/posts' ||
        req.method === 'HEAD') {
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

// Define the scheduleDailyScoreCheck function with proper safeguards
scheduleDailyScoreCheck = () => {
  // Clear any existing interval
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
    notificationCheckInterval = null;
  }

  logger.info('Starting automated notification scheduling');
  logger.info('Checking every hour to send once-daily reminders to users at their selected time');

  // Function to check and send notifications
  const checkNotifications = async () => {
    // Prevent concurrent checks
    if (isCheckingNotifications) {
      logger.debug('Notification check already in progress, skipping');
      return;
    }

    try {
      isCheckingNotifications = true;
      
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      logger.info(`Running hourly notification check at ${currentHour}:${String(currentMinute).padStart(2, '0')}`);

      // Make internal request to check-daily-scores endpoint
      const response = await fetch(`http://localhost:${port}/api/check-daily-scores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentHour,
          currentMinute,
        }),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        logger.error(`Daily score check failed: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      // Log errors but don't crash the server
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Daily score check timed out after 30 seconds');
      } else {
        logger.error('Error in scheduled notification check:', error);
      }
    } finally {
      isCheckingNotifications = false;
    }
  };

  // Function to check for and send missed notifications on startup
  const checkForMissedNotifications = async () => {
    try {
      logger.info('[CATCH-UP] Checking for missed notifications since last check...');
      
      // Get the last check time from database
      const lastCheckRecord = await db
        .select()
        .from(await import('@shared/schema').then(m => m.systemState))
        .where(sql`key = 'last_notification_check'`)
        .limit(1);
      
      if (!lastCheckRecord || lastCheckRecord.length === 0) {
        logger.info('[CATCH-UP] No previous check time found - this is first run');
        return;
      }
      
      const lastCheckTime = new Date(lastCheckRecord[0].value!);
      const now = new Date();
      const hoursSinceLastCheck = (now.getTime() - lastCheckTime.getTime()) / (1000 * 60 * 60);
      
      logger.info(`[CATCH-UP] Last check was at ${lastCheckTime.toISOString()}`);
      logger.info(`[CATCH-UP] Time elapsed: ${hoursSinceLastCheck.toFixed(2)} hours`);
      
      // If less than 55 minutes, no catch-up needed
      if (hoursSinceLastCheck < (55 / 60)) {
        logger.info('[CATCH-UP] Less than 55 minutes since last check, no catch-up needed');
        return;
      }
      
      // Calculate which hourly windows were missed
      const missedHours = [];
      const lastCheckHour = new Date(lastCheckTime);
      lastCheckHour.setMinutes(0, 0, 0);
      lastCheckHour.setHours(lastCheckHour.getHours() + 1); // Start from next hour after last check
      
      const currentHour = new Date(now);
      currentHour.setMinutes(0, 0, 0);
      
      let checkHour = new Date(lastCheckHour);
      while (checkHour < currentHour) {
        missedHours.push({
          hour: checkHour.getUTCHours(),
          minute: 0,
          timestamp: new Date(checkHour)
        });
        checkHour = new Date(checkHour.getTime() + 3600000); // Add 1 hour
      }
      
      if (missedHours.length === 0) {
        logger.info('[CATCH-UP] No missed hourly windows found');
        return;
      }
      
      logger.info(`[CATCH-UP] Found ${missedHours.length} missed hourly windows`);
      
      // Send notifications for each missed hour
      for (const missed of missedHours) {
        try {
          logger.info(`[CATCH-UP] Checking missed hour: ${missed.hour}:00 UTC`);
          
          const response = await fetch(`http://localhost:${port}/api/check-daily-scores`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              currentHour: missed.hour,
              currentMinute: missed.minute,
            }),
            signal: AbortSignal.timeout(30000),
          });
          
          if (!response.ok) {
            logger.error(`[CATCH-UP] Failed to check missed hour ${missed.hour}:00`);
          } else {
            logger.info(`[CATCH-UP] Successfully processed missed hour ${missed.hour}:00`);
          }
          
          // Small delay between checks to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error(`[CATCH-UP] Error processing missed hour ${missed.hour}:00:`, error);
        }
      }
      
      logger.info('[CATCH-UP] Finished processing missed notifications');
    } catch (error) {
      logger.error('[CATCH-UP] Error checking for missed notifications:', error);
    }
  };

  // Check for missed notifications on startup (don't await - run in background)
  checkForMissedNotifications().catch(err => {
    logger.error('[CATCH-UP] Failed to check for missed notifications:', err);
  });

  // Calculate time until next hour (at :00 minutes)
  const now = new Date();
  const minutesUntilNextHour = 60 - now.getMinutes();
  const secondsUntilNextHour = 60 - now.getSeconds();
  const msUntilNextHour = (minutesUntilNextHour - 1) * 60000 + secondsUntilNextHour * 1000;
  
  logger.info(`Current time: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
  logger.info(`Scheduling first check in ${Math.round(msUntilNextHour / 1000)} seconds (at next :00 mark)`);
  
  // Run first check at the next hour
  setTimeout(() => {
    console.log(`[NOTIFICATION SCHEDULER] First hourly check at ${new Date().toISOString()}`);
    checkNotifications();
    
    // Then run every hour on the hour
    notificationCheckInterval = setInterval(() => {
      console.log(`[NOTIFICATION SCHEDULER] Hourly check triggered at ${new Date().toISOString()}`);
      checkNotifications();
    }, 3600000);
  }, msUntilNextHour);
  
  console.log('[NOTIFICATION SCHEDULER] Interval set successfully - will check every hour on the hour');
  logger.info('Daily notification scheduler started successfully');
};

// Clean up interval on server shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, cleaning up notification scheduler');
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
    notificationCheckInterval = null;
  }
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, cleaning up notification scheduler');
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
    notificationCheckInterval = null;
  }
});

// Ensure API requests respond with JSON
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Start server immediately for fast deployment detection
console.log(`[Server Startup] Starting server on port ${port}...`);
server.listen(port, "0.0.0.0", () => {
  log(`[Server Startup] Server listening on port ${port}`);
  console.log("[Startup] Server ready and accepting connections!");
  
  // Initialize all heavy operations after server is listening
  setImmediate(async () => {
    try {
      console.log("[Post-Startup] Beginning initialization...");
      
      // Register API routes after server is listening
      await registerRoutes(app);
      
      // Global API error handlers
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

      // Setup static file serving based on environment
      if (app.get("env") === "development") {
        console.log("[Post-Startup] Setting up Vite...");
        await setupVite(app, server);
      } else {
        serveStatic(app);
      }
      
      // Setup simplified shared files handler (lazy loaded)
      app.use('/shared/uploads', async (req, res, next) => {
        try {
          const filename = path.basename(req.path.split('?')[0]);
          const { spartaObjectStorage } = await import("./sparta-object-storage-final");
          
          const isThumbnail = req.query.thumbnail === "true";
          let storageKey = isThumbnail && !filename.includes("thumbnail") 
            ? `shared/uploads/thumbnails/${filename}`
            : `shared/uploads/${filename}`;

          const fileBuffer = await spartaObjectStorage.downloadFile(storageKey);
          
          if (fileBuffer && fileBuffer.length > 0) {
            const ext = path.extname(req.path).toLowerCase();
            const contentTypes: Record<string, string> = {
              '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
              '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
              '.svg': 'image/svg+xml', '.webp': 'image/webp'
            };
            
            res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(fileBuffer);
          } else {
            return res.status(404).json({ error: "File not found" });
          }
        } catch (error) {
          console.error('Error serving shared file:', error);
          next(error);
        }
      });

      // Setup simplified uploads redirect
      app.use('/uploads', (req, res) => {
        const objectStorageUrl = `/api/object-storage/direct-download?key=uploads${req.path}`;
        return res.redirect(302, objectStorageUrl);
      });

      console.log("[Post-Startup] Initialization complete");
      
      // Start the daily notification scheduler
      logger.info("[Post-Startup] Starting daily notification scheduler...");
      scheduleDailyScoreCheck();

    } catch (error) {
      console.error("[Post-Startup] Initialization error (non-critical):", error);
    }
  });
});
