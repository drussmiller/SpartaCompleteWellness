import express, { Router } from "express";
import { Server as HttpServer } from "http";
import { authenticate } from "./auth";
import { storage } from "./storage";

export const registerRoutes = async (app: express.Application): Promise<HttpServer> => {
  const router = Router();

  // Debug middleware to log all requests
  router.use((req, res, next) => {
    console.log('Request:', {
      method: req.method,
      path: req.path,
      headers: req.headers,
      session: req.session,
      isAuthenticated: req.isAuthenticated?.() || false,
      user: req.user?.id
    });
    next();
  });

  // Simple ping endpoint to verify API functionality
  router.get("/api/ping", (req, res) => {
    console.log('Ping endpoint called');
    res.json({ message: "pong" });
  });

  // Protected endpoint example
  router.get("/api/protected", authenticate, (req, res) => {
    res.json({ message: "This is a protected endpoint", user: req.user?.id });
  });

  // Posts endpoints
  router.get("/api/posts", authenticate, async (req, res) => {
    try {
      console.log('Fetching posts for user:', req.user?.id);
      const posts = await storage.getAllPosts();
      console.log('Raw posts:', posts);

      // For each post, get its author information
      const postsWithAuthors = await Promise.all(posts.map(async (post) => {
        const author = await storage.getUser(post.userId);
        return {
          ...post,
          author: author || null
        };
      }));

      console.log('Successfully fetched posts with authors:', postsWithAuthors.length);
      res.json(postsWithAuthors);
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  app.use(router);

  // Create HTTP server
  const httpServer = new HttpServer(app);

  return httpServer;
};