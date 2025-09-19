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

// Remove the placeholder route since the real endpoint is in routes.ts
// We'll directly call the endpoint in routes.ts


(async () => {
  try {
    console.log("[Startup] Beginning server initialization...");
    console.log("[Debug] Environment variables:", {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? '***configured***' : 'missing',
      ENABLE_CONSOLE_LOGGING: process.env.ENABLE_CONSOLE_LOGGING
    });
    const startTime = Date.now();

    // Verify database connection
    console.log("[Startup] Verifying database connection...");
    try {
      const testQuery = await db.execute(sql`SELECT 1`);
      console.log("[Startup] Database connection verified", Date.now() - startTime, "ms");
      console.log("[Debug] Database test query result:", testQuery);
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

        // Extract filename from path, handling potential query parameters
        const filename = path.basename(filePath.split('?')[0]);
        console.log(`Extracted filename: ${filename}`);

        // Import the Object Storage utility that was working before
        const { spartaObjectStorage } = await import(
          "./sparta-object-storage-final"
        );

        // Check if this is a thumbnail request
        const isThumbnail = req.query.thumbnail === "true";

        // Construct the proper Object Storage key
        let storageKey: string;
        if (isThumbnail) {
          storageKey = filename.includes("thumbnail")
            ? `shared/uploads/${filename}`
            : `shared/uploads/thumbnails/${filename}`;
        } else {
          // For regular files, construct the key as it was stored
          storageKey = filename.startsWith("shared/")
            ? filename
            : `shared/uploads/${filename}`;
        }

        // Download the file from Object Storage using the correct method
        const fileBuffer = await spartaObjectStorage.downloadFile(storageKey);

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

          console.log(`SUCCESS: Serving file ${storageKey} from Object Storage (size: ${fileBuffer.length} bytes, type: ${contentType})`);

          // Set headers and send the file
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache
          return res.send(fileBuffer);
        } else {
          console.error(`File not found or empty: ${storageKey}`);
          return res.status(404).json({
            error: "File not found",
            message: `Could not retrieve ${storageKey}`
          });
        }
      } catch (error) {
        console.error('Error serving shared file:', error);
        // Pass error to the next middleware or default error handler
        next(error);
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

    // Simple server startup on port 5000
    port = 5000;
    console.log(`[Server Startup] Starting server on port ${port}...`);
    server.listen(port, "0.0.0.0", () => {
      log(`[Server Startup] Server listening on port ${port}`);
    });

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
