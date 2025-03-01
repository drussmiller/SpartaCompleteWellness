import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { promisify } from "util";
import { exec } from "child_process";
import { Server as HttpServer } from "http";

const execAsync = promisify(exec);

// Global unhandled error handlers
process.on('uncaughtException', (error) => {
  console.error('=== Uncaught Exception ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('=== Unhandled Promise Rejection ===');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

const app = express();

// Enhanced request logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  console.log(`[${new Date().toISOString()}] ${req.method} ${path} - Started`);
  console.log('Request headers:', req.headers);

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${path} ${res.statusCode} - Completed in ${duration}ms`);
  });

  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

(async () => {
  let server: HttpServer;
  try {
    console.log('Starting server initialization...');

    // Create and configure server
    server = await registerRoutes(app);

    // Enhanced error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Express error handler:', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Temporarily skip migrations to isolate crash issue
    // await runMigrations();

    // ALWAYS serve the app on port 5000
    const port = 5000;

    // Simple server startup with retry
    const startServer = async (): Promise<void> => {
      return new Promise((resolve, reject) => {
        try {
          server.listen(port, "0.0.0.0", () => {
            console.log(`Server listening on port ${port}`);
            resolve();
          });

          server.on('error', (error: NodeJS.ErrnoException) => {
            console.error('Server startup error:', error);
            reject(error);
          });
        } catch (error) {
          reject(error);
        }
      });
    };

    await startServer();

    // Handle graceful shutdown
    const shutdown = (signal: string) => {
      console.log(`\n[Server Shutdown] Received ${signal} signal`);
      server.close(() => {
        console.log('[Server Shutdown] Server closed');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('[Server Shutdown] Forced exit after timeout');
        process.exit(1);
      }, 5000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error("[Server Fatal] Failed to start server:", error);
    process.exit(1);
  }
})();