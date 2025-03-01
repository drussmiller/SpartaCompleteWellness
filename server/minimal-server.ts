import express from "express";
import { createServer } from "http";

// Initialize express app
const app = express();

// Basic request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Test endpoint with enhanced logging
app.get("/ping", (req, res) => {
  console.log('Ping request received from:', req.ip); //Added logging from original code
  res.send('pong');
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).send('Internal Server Error');
});

// Start server
const port = 5000;
const server = createServer(app);

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});

// Handle graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\nReceived ${signal} signal, shutting down...`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force close after timeout
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Auto-terminate after 5 seconds for testing
setTimeout(() => {
  console.log('\nTest complete - auto-terminating server');
  shutdown('TIMEOUT');
}, 5000);