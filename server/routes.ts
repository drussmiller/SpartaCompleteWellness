import express, { Router, Request, Response } from "express";
import { db } from "./db";
import {
  Post,
  User,
  Team,
  Reaction,
} from "@shared/schema";
import { eq, desc, isNull, and, sql, like, asc, SQL } from "drizzle-orm";
import { authenticate } from "./auth";
import { Server as HttpServer } from "http";
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

  // Posts endpoints
  router.get("/api/posts", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Unauthenticated request to /api/posts');
      return res.status(401).json({ message: "Unauthorized" });
    }

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

  router.post("/api/posts", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId, content, type, image } = req.body;

      let imageUrl = null;
      if (image) {
        // Upload image to storage
        imageUrl = await uploadImage(image);
      }

      // Create post
      const [newPost] = await db
        .insert(Post)
        .values({
          userId,
          content,
          type,
          imageUrl,
        })
        .returning();

      // Get post with user
      const post = await db.query.Post.findFirst({
        where: eq(Post.id, newPost.id),
        with: {
          user: true,
          comments: {
            with: {
              user: true,
            },
          },
          reactions: {
            with: {
              user: true,
            },
          },
        },
      });

      // Award points based on post type
      let pointsToAward = 0;
      switch (type) {
        case "scripture":
        case "food":
        case "workout":
          pointsToAward = 3;
          break;
        case "memory-verse":
          pointsToAward = 10;
          break;
        default:
          pointsToAward = 1;
      }

      if (pointsToAward > 0) {
        await db
          .update(User)
          .set({
            points: sql`${User.points} + ${pointsToAward}`,
          })
          .where(eq(User.id, userId));
      }

      return res.status(201).json(post);
    } catch (error) {
      console.error("Error creating post:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  router.delete("/api/posts/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      const postId = parseInt(req.params.id);

      // Get post
      const post = await db.query.Post.findFirst({
        where: eq(Post.id, postId),
      });

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if user is post owner or admin
      const user = await db.query.User.findFirst({
        where: eq(User.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (post.userId !== userId && !user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }

      // Delete all comments for this post
      await db.delete(Comment).where(eq(Comment.postId, postId));

      // Delete all reactions for this post
      await db.delete(Reaction).where(eq(Reaction.postId, postId));

      // Delete post
      await db.delete(Post).where(eq(Post.id, postId));

      return res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
      console.error("Error deleting post:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Comments routes
  router.post("/api/posts/:id/comments", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId, content } = req.body;
      const postId = parseInt(req.params.id);

      // Check if post exists
      const post = await db.query.Post.findFirst({
        where: eq(Post.id, postId),
      });

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Create comment
      const [newComment] = await db
        .insert(Comment)
        .values({
          userId,
          postId,
          content,
        })
        .returning();

      // Get comment with user
      const comment = await db.query.Comment.findFirst({
        where: eq(Comment.id, newComment.id),
        with: {
          user: true,
        },
      });

      return res.status(201).json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reactions routes
  router.post("/api/posts/:id/reactions", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId, type } = req.body;
      const postId = parseInt(req.params.id);

      // Check if post exists
      const post = await db.query.Post.findFirst({
        where: eq(Post.id, postId),
      });

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Check if user already reacted with this type
      const existingReaction = await db.query.Reaction.findFirst({
        where: and(
          eq(Reaction.userId, userId),
          eq(Reaction.postId, postId),
          eq(Reaction.type, type)
        ),
      });

      if (existingReaction) {
        // Remove reaction if it already exists (toggle behavior)
        await db.delete(Reaction).where(eq(Reaction.id, existingReaction.id));
        return res.status(200).json({ message: "Reaction removed" });
      }

      // Create reaction
      const [newReaction] = await db
        .insert(Reaction)
        .values({
          userId,
          postId,
          type,
        })
        .returning();

      // Get reaction with user
      const reaction = await db.query.Reaction.findFirst({
        where: eq(Reaction.id, newReaction.id),
        with: {
          user: true,
        },
      });

      return res.status(201).json(reaction);
    } catch (error) {
      console.error("Error creating reaction:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Teams routes
  router.get("/api/teams", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;

      // Check if user is admin
      const user = await db.query.User.findFirst({
        where: eq(User.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to view all teams" });
      }

      // Get all teams
      const teams = await db.query.Team.findMany({
        orderBy: (teams, { asc }) => [asc(teams.name)],
      });

      return res.status(200).json(teams);
    } catch (error) {
      console.error("Error getting teams:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  router.post("/api/teams", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId, name, description } = req.body;

      // Check if user is admin
      const user = await db.query.User.findFirst({
        where: eq(User.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to create teams" });
      }

      // Create team
      const [newTeam] = await db
        .insert(Team)
        .values({
          name,
          description,
        })
        .returning();

      return res.status(201).json(newTeam);
    } catch (error) {
      console.error("Error creating team:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  router.patch("/api/teams/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId, name, description } = req.body;
      const teamId = parseInt(req.params.id);

      // Check if user is admin
      const user = await db.query.User.findFirst({
        where: eq(User.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to update teams" });
      }

      // Check if team exists
      const team = await db.query.Team.findFirst({
        where: eq(Team.id, teamId),
      });

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Update team
      const [updatedTeam] = await db
        .update(Team)
        .set({
          name: name || team.name,
          description: description !== undefined ? description : team.description,
        })
        .where(eq(Team.id, teamId))
        .returning();

      return res.status(200).json(updatedTeam);
    } catch (error) {
      console.error("Error updating team:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  router.delete("/api/teams/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      const teamId = parseInt(req.params.id);

      // Check if user is admin
      const user = await db.query.User.findFirst({
        where: eq(User.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete teams" });
      }

      // Check if team exists
      const team = await db.query.Team.findFirst({
        where: eq(Team.id, teamId),
      });

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Update users to remove team
      await db
        .update(User)
        .set({
          teamId: null,
        })
        .where(eq(User.teamId, teamId));

      // Delete team
      await db.delete(Team).where(eq(Team.id, teamId));

      return res.status(200).json({ message: "Team deleted successfully" });
    } catch (error) {
      console.error("Error deleting team:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Users routes
  router.get("/api/users", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;

      // Check if user is admin
      const user = await db.query.User.findFirst({
        where: eq(User.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to view all users" });
      }

      // Get all users
      const users = await db.query.User.findMany({
        orderBy: (users, { asc }) => [asc(users.username)],
      });

      // Remove passwords
      const usersWithoutPasswords = users.map((user) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });

      return res.status(200).json(usersWithoutPasswords);
    } catch (error) {
      console.error("Error getting users:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  router.patch("/api/users/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId, teamId, username, email } = req.body;
      const targetUserId = parseInt(req.params.id);

      // Check if user is admin
      const user = await db.query.User.findFirst({
        where: eq(User.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isAdmin && userId !== targetUserId) {
        return res.status(403).json({ message: "Not authorized to update other users" });
      }

      // Check if target user exists
      const targetUser = await db.query.User.findFirst({
        where: eq(User.id, targetUserId),
      });

      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }

      // Prepare update data
      const updateData: Partial<typeof User.$inferInsert> = {};

      if (teamId !== undefined) {
        // Only admins can change team
        if (!user.isAdmin) {
          return res.status(403).json({ message: "Not authorized to change team" });
        }
        updateData.teamId = teamId;
      }

      if (username) {
        // Check if username is already taken
        const existingUser = await db.query.User.findFirst({
          where: and(eq(User.username, username), sql`${User.id} != ${targetUserId}`),
        });

        if (existingUser) {
          return res.status(400).json({ message: "Username already exists" });
        }

        updateData.username = username;
      }

      if (email) {
        // Check if email is already taken
        const existingUser = await db.query.User.findFirst({
          where: and(eq(User.email, email), sql`${User.id} != ${targetUserId}`),
        });

        if (existingUser) {
          return res.status(400).json({ message: "Email already exists" });
        }

        updateData.email = email;
      }

      // Update user
      const [updatedUser] = await db
        .update(User)
        .set(updateData)
        .where(eq(User.id, targetUserId))
        .returning();

      // Remove password from response
      const { password: _, ...userWithoutPassword } = updatedUser;

      return res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  router.patch("/api/users/:id/role", authenticate, async (req: Request, res: Response) => {
    try {
      const { userId, isAdmin, isTeamLead } = req.body;
      const targetUserId = parseInt(req.params.id);

      // Check if user is admin
      const user = await db.query.User.findFirst({
        where: eq(User.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to update user roles" });
      }

      // Check if target user exists
      const targetUser = await db.query.User.findFirst({
        where: eq(User.id, targetUserId),
      });

      if (!targetUser) {
        return res.status(404).json({ message: "Target user not found" });
      }

      // Prepare update data
      const updateData: Partial<typeof User.$inferInsert> = {};

      if (isAdmin !== undefined) {
        updateData.isAdmin = isAdmin;
      }

      if (isTeamLead !== undefined) {
        updateData.isTeamLead = isTeamLead;
      }

      // Update user
      const [updatedUser] = await db
        .update(User)
        .set(updateData)
        .where(eq(User.id, targetUserId))
        .returning();

      // Remove password from response
      const { password: _, ...userWithoutPassword } = updatedUser;

      return res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating user role:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get reactions by post 
  router.get("/api/posts/:id/reactions", authenticate, async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.id);

      // Check if post exists
      const post = await db.query.Post.findFirst({
        where: eq(Post.id, postId),
      });

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Get all reactions for the post
      const reactions = await db.query.Reaction.findMany({
        where: eq(Reaction.postId, postId),
        with: {
          user: true,
        },
      });

      return res.status(200).json(reactions);
    } catch (error) {
      console.error("Error getting reactions:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get users who reacted with a specific emoji
  router.get("/api/posts/:id/reactions/:type/users", authenticate, async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.id);
      const type = req.params.type;

      // Check if post exists
      const post = await db.query.Post.findFirst({
        where: eq(Post.id, postId),
      });

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Get all users who reacted with this emoji
      const reactions = await db.query.Reaction.findMany({
        where: and(
          eq(Reaction.postId, postId),
          eq(Reaction.type, type)
        ),
        with: {
          user: true,
        },
      });

      // Extract just the users
      const users = reactions.map(reaction => {
        const { password, ...userWithoutPassword } = reaction.user;
        return userWithoutPassword;
      });

      return res.status(200).json(users);
    } catch (error) {
      console.error("Error getting reaction users:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.use(router);

  // Create HTTP server
  const httpServer = new HttpServer(app);

  return httpServer;
};