import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Add detailed startup logging
console.log("Starting server initialization...");

const app = express();
// Increase body parser limits for handling larger files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

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
  try {
    console.log("Initializing server routes...");
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Error middleware caught:', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    if (app.get("env") === "development") {
      console.log("Setting up Vite development server...");
      await setupVite(app, server);
    } else {
      console.log("Setting up static file serving...");
      serveStatic(app);
    }

    // Temporarily comment out migrations to isolate startup issues
    // console.log("Running database migrations...");
    // await runMigrations();

    // Always use port 5000 as specified in the development guidelines
    const port = process.env.PORT || 5000;
    server.listen({
      port,
      host: "0.0.0.0",
    }, () => {
      log(`Server started successfully, serving on port ${port}`);
    }).on('error', (e) => {
      console.error('Server startup error:', e);
      process.exit(1);
    });
  } catch (error) {
    console.error('Fatal server initialization error:', error);
    process.exit(1);
  }
})();

async function runMigrations() {
  console.log("Starting database migrations...");
  try {
    const { runMigrations: executeMigrations } = await import("./db/migrations");
    await executeMigrations();
    console.log("Database migrations completed successfully.");
  } catch (error) {
    console.error("Failed to run database migrations:", error);
    throw error;
  }
}