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

// Add immediate health check endpoint before any heavy operations
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

// Define the scheduleDailyScoreCheck function (disabled automatic scheduling to prevent server overload)
scheduleDailyScoreCheck = () => {
  logger.info('Daily score check scheduling is disabled to prevent server overload');
  logger.info('Use the admin panel or API endpoints to manually trigger daily score checks');
};

// Ensure API requests respond with JSON
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Initialize server asynchronously but start listening immediately
(async () => {
  try {
    // Register API routes before server starts (critical for deployment)
    console.log("[Startup] Registering routes...");
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
      console.log("[Startup] Setting up Vite...");
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Start server immediately on port 5000 for fast deployment detection
    console.log(`[Server Startup] Starting server on port ${port} for immediate availability...`);
    server.listen(port, "0.0.0.0", () => {
      log(`[Server Startup] Server listening on port ${port}`);
      console.log("[Startup] Server ready!");
    });

  } catch (error) {
    console.error("[Startup] Critical error during server initialization:", error);
    process.exit(1);
  }
})();

// Run optional initialization after server is ready (non-critical setup)
setTimeout(() => {
  (async () => {
    try {
      console.log("[Post-Startup] Beginning optional initialization...");
      
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

      // Run migrations lazily in background (won't block deployment)
      runMigrations().then(() => {
        console.log("[Post-Startup] Database migrations completed successfully");
      }).catch((error) => {
        console.error("[Post-Startup] Migration failed (non-critical for deployment):", error);
      });

      console.log("[Post-Startup] Optional initialization complete");

    } catch (error) {
      console.error("[Post-Startup] Non-critical initialization error:", error);
    }
  })();
}, 1000); // Wait 1 second after server starts to run optional tasks

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
