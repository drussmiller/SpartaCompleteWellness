import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

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

    // Always use port 5000 as specified in the development guidelines
    const port = process.env.PORT || 5000;

    // Handle server shutdown gracefully
    let shuttingDown = false;
    const gracefulShutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;

      console.log('Received shutdown signal. Closing HTTP server...');
      server?.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });

      // Force close after 5s
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 5000);
    };

    // Handle various shutdown signals
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Try to start the server with retries and increasing delays
    const startServer = async (retries = 3, delay = 1000) => {
      try {
        return await new Promise((resolve, reject) => {
          const serverInstance = server.listen({
            port,
            host: "0.0.0.0",
          }, () => {
            log(`Server listening on port ${port}`);
            resolve(serverInstance);
          });

          serverInstance.on('error', (e: any) => {
            if (e.code === 'EADDRINUSE' && retries > 0) {
              console.log(`Port ${port} is in use, retrying in ${delay}ms...`);
              serverInstance.close();
              setTimeout(() => {
                startServer(retries - 1, delay * 2)
                  .then(resolve)
                  .catch(reject);
              }, delay);
            } else {
              reject(e);
            }
          });
        });
      } catch (error) {
        if (retries > 0) {
          console.log('Retrying server start after error:', error);
          await new Promise(resolve => setTimeout(resolve, delay));
          return startServer(retries - 1, delay * 2);
        }
        throw error;
      }
    };

    await startServer();

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