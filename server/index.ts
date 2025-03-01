import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
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
    // Log environment status
    console.log('\n=== Environment Check ===');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? '[Set]' : '[Not Set]');
    console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? '[Set]' : '[Not Set]');
    console.log('=====================\n');

    console.log('[Server] Starting initialization...');

    // Create HTTP server and register routes
    console.log('[Server] Creating HTTP server...');
    server = createServer(app);
    console.log('[Server] HTTP server created');

    console.log('[Server] Registering routes...');
    await registerRoutes(app);
    console.log('[Server] Routes registered');

    // Setup error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      logError('Express Error', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    // Start listening
    const port = 5000;
    console.log(`[Server] Attempting to listen on port ${port}...`);

    await new Promise<void>((resolve, reject) => {
      server.on('error', (error) => {
        console.error('[Server] Listen error:', error);
        reject(error);
      });

      server.listen(port, "0.0.0.0", () => {
        console.log(`[Server] Successfully listening on port ${port}`);
        resolve();
      });
    });

    // Handle shutdown gracefully
    const shutdown = (signal: string) => {
      console.log(`\n[Server] Received ${signal} signal, shutting down...`);
      server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout');
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