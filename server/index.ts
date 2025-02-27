import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

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
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  let server;
  try {
    server = await registerRoutes(app);

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

    await runMigrations();

    // ALWAYS serve the app on port 5000
    const port = 5000;

    // Kill any existing process on port 5000
    const killPort = async (port: number) => {
      try {
        console.log(`Attempting to kill process on port ${port}...`);
        if (process.platform === "win32") {
          await execAsync(`netstat -ano | findstr :${port}`);
        } else {
          await execAsync(`lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs -r kill -9`);
        }
        console.log(`Successfully killed process on port ${port}`);
      } catch (error) {
        // Ignore errors as the port might not be in use
        console.log(`No process found on port ${port}`);
      }
    };

    // Improved server cleanup mechanism
    let currentServer: any = null;
    const cleanupAndStartServer = async (retries = 3, delay = 1000) => {
      try {
        // First kill any existing process on the port
        await killPort(port);

        // Close existing server if any
        if (currentServer) {
          await new Promise<void>((resolve) => {
            currentServer.close(() => {
              console.log('Existing server closed');
              resolve();
            });
          });
        }

        // Try to start new server
        console.log(`Attempting to start server on port ${port}...`);
        currentServer = server.listen({
          port,
          host: "0.0.0.0",
        }, () => {
          log(`Server listening on port ${port}`);
        });

        // Handle server errors
        currentServer.on('error', async (e: any) => {
          if (e.code === 'EADDRINUSE' && retries > 0) {
            console.log(`Port ${port} is in use, retrying in ${delay}ms...`);
            await killPort(port);
            await new Promise(resolve => setTimeout(resolve, delay));
            await cleanupAndStartServer(retries - 1, delay * 2);
          } else {
            console.error('Server error:', e);
            process.exit(1);
          }
        });

        return currentServer;
      } catch (error) {
        console.error('Error starting server:', error);
        if (retries > 0) {
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return cleanupAndStartServer(retries - 1, delay * 2);
        }
        throw error;
      }
    };

    // Handle graceful shutdown
    const gracefulShutdown = () => {
      console.log('Received shutdown signal. Closing HTTP server...');
      if (currentServer) {
        currentServer.close(() => {
          console.log('HTTP server closed');
          process.exit(0);
        });

        // Force close after 5s
        setTimeout(() => {
          console.error('Could not close connections in time, forcefully shutting down');
          process.exit(1);
        }, 5000);
      } else {
        process.exit(0);
      }
    };

    // Handle various shutdown signals
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Start server with cleanup and retry mechanism
    await cleanupAndStartServer();

  } catch (error) {
    console.error("Failed to start server:", error);
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