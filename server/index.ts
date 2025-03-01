import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { createServer } from "http";

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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

async function startServer() {
  try {
    console.log('[Server] Starting server initialization...');
    console.log('[Server] Setting up Express application...');

    // Register routes first
    console.log('[Server] Beginning route registration...');
    await registerRoutes(app);
    console.log('[Server] Routes registered successfully');

    // Setup error handling middleware
    console.log('[Server] Setting up error handling middleware...');
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      logError('Express Error', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });
    console.log('[Server] Error handling middleware configured');

    // Create and start the HTTP server
    const port = 5000;
    console.log(`[Server] Creating HTTP server on port ${port}...`);
    const server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(port, "0.0.0.0", () => {
        console.log(`[Server] Server successfully listening on port ${port}`);
        resolve();
      });
    });

    // Graceful shutdown handlers
    const shutdown = (signal: string) => {
      console.log(`\n[Server] Received ${signal} signal, shutting down...`);
      server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    console.log('[Server] Server startup complete, ready to handle requests');

  } catch (error) {
    logError('Server Startup Error', error as Error);
    process.exit(1);
  }
}

startServer().catch((error) => {
  logError('Server Bootstrap Error', error);
  process.exit(1);
});