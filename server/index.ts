import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { createServer, type Server } from "http";

// Enhanced error logging
function logError(prefix: string, error: Error) {
  console.error(`=== ${prefix} ===`);
  console.error('Message:', error.message);
  console.error('Stack:', error.stack);
  console.error('==================');
}

// Global error handlers
process.on('uncaughtException', (error) => {
  logError('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError('Unhandled Promise Rejection', reason as Error);
  process.exit(1);
});

const app = express();

// Basic request logging
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Started`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });

  next();
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

async function startServer() {
  let server: Server;

  try {
    console.log('Starting server initialization...');

    // Create HTTP server and register routes
    server = createServer(app);
    await registerRoutes(app);

    // Setup error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      logError('Express Error', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    // Setup Vite or static files
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Start listening
    const port = 5000;
    server.listen(port, "0.0.0.0", () => {
      console.log(`Server listening on port ${port}`);
    });

    // Handle shutdown gracefully
    const shutdown = (signal: string) => {
      console.log(`\nReceived ${signal} signal, shutting down...`);
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 5000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logError('Server Startup Error', error as Error);
    process.exit(1);
  }
}

startServer().catch((error) => {
  logError('Server Bootstrap Error', error);
  process.exit(1);
});