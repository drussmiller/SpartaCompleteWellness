import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { db } from "./db";
import { queryClient } from "../client/src/lib/queryClient";
import { eq, and, desc, sql, or, gte, lte } from "drizzle-orm";
import {
  posts,
  notifications,
  videos,
  users,
  teams,
  activities,
  workoutVideos,
  insertTeamSchema,
  insertPostSchema,
  insertMeasurementSchema,
  insertNotificationSchema,
  insertVideoSchema,
  insertActivitySchema
} from "@shared/schema";
import { setupAuth, hashPassword, comparePasswords } from "./auth";
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Keep track of connected clients
const clients = new Map<number, WebSocket>();

// Admin middleware
const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  next();
};

// Helper function to send notification
async function sendNotification(userId: number, title: string, message: string) {
  try {
    console.log('Attempting to send notification to user:', userId);

    const notificationData = insertNotificationSchema.parse({
      userId,
      title,
      message,
      read: false,
      createdAt: new Date()
    });

    console.log('Notification data validated:', notificationData);

    const notification = await storage.createNotification(notificationData);
    console.log('Notification created in database:', notification);

    const ws = clients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket connection found for user:', userId);
      ws.send(JSON.stringify(notification));
      console.log('Notification sent through WebSocket');
    } else {
      console.log('No active WebSocket connection found for user:', userId);
    }

    return notification;
  } catch (error) {
    console.error('Error sending notification:', error);
    if (error instanceof z.ZodError) {
      console.error('Zod error sending notification:', error.errors);
    }
    throw error;
  }
}

// Add week start/end date calculation helper
function getWeekBounds(date: Date) {
  const curr = new Date(date);
  // Adjust to Monday start (1) and Sunday end (0)
  const day = curr.getDay();
  const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday

  const weekStart = new Date(curr.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

// Update weekly post count function in routes.ts
async function getWeeklyPostCount(userId: number, type: string, date: Date): Promise<number> {
  const { weekStart, weekEnd } = getWeekBounds(date);

  const weeklyPosts = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.userId, userId),
        eq(posts.type, type),
        gte(posts.createdAt!, weekStart),
        lte(posts.createdAt!, weekEnd)
      )
    );

  return weeklyPosts.length;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication first
  setupAuth(app);

  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      console.log('Login attempt for:', username);

      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log('User not found:', username);
        return res.status(401).json({ message: "Invalid username or password" });
      }

      const isValidPassword = await comparePasswords(password, user.password);
      if (!isValidPassword) {
        console.log('Invalid password for user:', username);
        return res.status(401).json({ message: "Invalid username or password" });
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Login error:', err);
          return res.status(500).json({ message: "An error occurred during login" });
        }
        res.json(user);
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: "An error occurred during login" });
    }
  });

  // Teams
  app.post("/api/teams", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);
    try {
      const team = await storage.createTeam(insertTeamSchema.parse(req.body));
      res.status(201).json(team);
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json(e.errors);
      } else {
        console.error('Error creating team:', e);
        res.status(500).json({ error: "Failed to create team" });
      }
    }
  });

  app.get("/api/teams", async (req, res) => {
    const teams = await storage.getTeams();
    res.json(teams);
  });

  app.patch("/api/teams/:id", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);

    try {
      const teamId = parseInt(req.params.id);
      const { name, description } = req.body;

      // Check if team exists
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId));

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Update team
      const [updatedTeam] = await db
        .update(teams)
        .set({ name, description })
        .where(eq(teams.id, teamId))
        .returning();

      res.json(updatedTeam);
    } catch (error) {
      console.error('Error updating team:', error);
      res.status(500).json({
        message: "Failed to update team",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.delete("/api/teams/:id", async (req, res) => {
    if (!req.user?.isAdmin) return res.sendStatus(403);

    try {
      const teamId = parseInt(req.params.id);

      // Check if team exists
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId));

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      await storage.deleteTeam(teamId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting team:', error);
      res.status(500).json({
        message: "Failed to delete team",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add this endpoint after the existing teams routes
  app.get("/api/teams/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, parseInt(req.params.id)));

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      res.json(team);
    } catch (error) {
      console.error('Error fetching team:', error);
      res.status(500).json({
        message: "Failed to fetch team",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // Posts
  app.post("/api/posts", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const postData = insertPostSchema.parse(req.body);

      // Special handling for memory verse posts
      if (postData.type === "memory_verse") {
        const today = new Date();
        if (today.getDay() !== 0) { // Check for Sunday (0)
          return res.status(400).json({
            error: "Memory verse posts can only be created on Sundays"
          });
        }

        const weeklyCount = await getWeeklyPostCount(req.user.id, "memory_verse", today);
        if (weeklyCount >= 1) {
          return res.status(400).json({
            error: "You have reached your weekly limit for memory verse posts"
          });
        }
      }

      // Create the post and update points
      const post = await db.transaction(async (tx) => {
        const [newPost] = await tx
          .insert(posts)
          .values({
            ...postData,
            userId: req.user!.id,
            points: postData.type === 'memory_verse' ? 10 : (postData.type === 'comment' ? 0 : 3),
            createdAt: new Date()
          })
          .returning();

        // Calculate points for current week only
        const { weekStart, weekEnd } = getWeekBounds(new Date());

        await tx
          .update(users)
          .set({
            points: sql`COALESCE((
              SELECT CAST(SUM(points) AS INTEGER)
              FROM ${posts}
              WHERE user_id = ${users.id}
              AND type != 'comment'
              AND created_at >= ${weekStart}
              AND created_at <= ${weekEnd}
            ), 0)`
          })
          .where(eq(users.id, req.user.id));

        return newPost;
      });

      // Get the updated user with accurate weekly points
      const { weekStart, weekEnd } = getWeekBounds(new Date());
      const [updatedUser] = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          isAdmin: users.isAdmin,
          teamId: users.teamId,
          imageUrl: users.imageUrl,
          points: sql`COALESCE((
            SELECT CAST(SUM(points) AS INTEGER)
            FROM ${posts}
            WHERE user_id = ${users.id}
            AND type != 'comment'
            AND created_at >= ${weekStart}
            AND created_at <= ${weekEnd}
          ), 0)`
        })
        .from(users)
        .where(eq(users.id, req.user.id));

      // Return both post and updated user data
      res.status(201).json({
        post,
        user: updatedUser
      });

    } catch (e) {
      console.error('Error creating post:', e);
      if (e instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          details: e.errors
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
          message: e instanceof Error ? e.message : 'Unknown error occurred'
        });
      }
    }
  });

  app.get("/api/posts/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const postId = parseInt(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      const [post] = await db
        .select({
          id: posts.id,
          type: posts.type,
          content: posts.content,
          imageUrl: posts.imageUrl,
          points: posts.points,
          userId: posts.userId,
          parentId: posts.parentId,
          createdAt: posts.createdAt,
          depth: posts.depth,
          author: {
            id: users.id,
            username: users.username,
            imageUrl: users.imageUrl,
            points: users.points
          }
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.id, postId));

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      res.json(post);
    } catch (error) {
      console.error('Error fetching post:', error);
      res.status(500).json({ error: "Failed to fetch post" });
    }
  });

  app.get("/api/posts", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      // If parentId is provided, return comments for that post
      if (req.query.parentId) {
        console.log('Fetching comments for post:', req.query.parentId);
        const comments = await db
          .select({
            id: posts.id,
            type: posts.type,
            content: posts.content,
            imageUrl: posts.imageUrl,
            points: posts.points,
            userId: posts.userId,
            parentId: posts.parentId,
            createdAt: posts.createdAt,
            depth: posts.depth,
            author: {
              id: users.id,
              username: users.username,
              imageUrl: users.imageUrl
            }
          })
          .from(posts)
          .leftJoin(users, eq(posts.userId, users.id))
          .where(
            and(
              eq(posts.parentId, parseInt(req.query.parentId as string)),
              eq(posts.type, 'comment')
            )
          )
          .orderBy(desc(posts.createdAt));

        console.log('Comments found:', comments.length);
        console.log('Sample comment data:', comments[0] || 'No comments found');
        res.json(comments);
        return;
      } else {
        // Get all posts for the user's team
        if (!req.user.teamId) {
          console.log('User has no team assigned:', req.user.id);
          return res.json([]); // If user has no team, return empty array
        }
        console.log('Fetching posts for team:', req.user.teamId);

        // Join with users table to get author information
        const teamPosts = await db
          .select({
            id: posts.id,
            type: posts.type,
            content: posts.content,
            imageUrl: posts.imageUrl,
            points: posts.points,
            userId: posts.userId,
            parentId: posts.parentId,
            createdAt: posts.createdAt,
            depth: posts.depth,
            author: {
              id: users.id,
              username: users.username,
              imageUrl: users.imageUrl,
              points: users.points
            }
          })
          .from(posts)
          .leftJoin(users, eq(posts.userId, users.id))
          .where(eq(users.teamId, req.user.teamId))
          .orderBy(desc(posts.createdAt));

        console.log('Posts found:', teamPosts.length);
        res.json(teamPosts);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).json({ error: "Failed to fetch posts" });
    }
  });

  app.delete("/api/posts/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const postId = parseInt(req.params.id);

      // First check if the post exists
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, postId));

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Allow users to delete their own posts or if they are admin
      if (post.userId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ message: "Not authorized to delete this post" });
      }

      // If not admin, check if post is from today
      if (!req.user.isAdmin) {
        const postDate = new Date(post.createdAt!);
        const today = new Date();

        // Compare only the date part
        const isFromPreviousDay =
          postDate.getUTCFullYear() !== today.getUTCFullYear() ||
          postDate.getUTCMonth() !== today.getUTCMonth() ||
          postDate.getUTCDate() !== today.getUTCDate();

        if (isFromPreviousDay) {
          return res.status(403).json({
            message: "Posts can only be deleted on the same day they were created"
          });
        }
      }

      // Use transaction to ensure both operations succeed or fail together
      await db.transaction(async (tx) => {
        console.log('Starting delete transaction for post:', postId);
        // Delete the post first
        await tx.delete(posts).where(eq(posts.id, postId));

        // Update user's points to reflect the accurate sum
        await tx
          .update(users)
          .set({
            points: sql`COALESCE((
              SELECT CAST(SUM(points) AS INTEGER)
              FROM ${posts}
              WHERE user_id = ${users.id}
              AND type != 'comment'
            ), 0)`
          })
          .where(eq(users.id, post.userId));
        console.log('Transaction complete for post deletion:', postId);
      });

      // Get the updated user with accurate points
      const [updatedUser] = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          isAdmin: users.isAdmin,
          teamId: users.teamId,
          imageUrl: users.imageUrl,
          points: sql`COALESCE((
            SELECT CAST(SUM(points) AS INTEGER)
            FROM ${posts}
            WHERE user_id = ${users.id}
            AND type != 'comment'
          ), 0)`
        })
        .from(users)
        .where(eq(users.id, post.userId));

      // Always return points as a number
      const sanitizedUser = {
        ...updatedUser,
        points: typeof updatedUser.points === 'number' ? updatedUser.points : 0
      };

      console.log('Updated user points after deletion:', sanitizedUser.points);

      // Return success along with updated user data
      res.json({
        success: true,
        user: sanitizedUser
      });

    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({
        message: "Failed to delete post",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add new comment thread endpoint after existing post routes
  app.get("/api/posts/comments/:postId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ message: "Invalid post ID" });
      }

      // Get total comment count including all replies using recursive CTE
      if (req.query.count === 'true') {
        console.log('Fetching comment count for post:', postId);
        const comments = await db
          .select({
            id: posts.id
          })
          .from(posts)
          .where(
            and(
              eq(posts.type, 'comment'),
              or(
                eq(posts.parentId, postId),
                sql`${posts.id} IN (
                  WITH RECURSIVE comment_tree AS (
                    SELECT id FROM ${posts}
                    WHERE parent_id = ${postId}
                    AND type = 'comment'

                    UNION ALL

                    SELECT p.id
                    FROM ${posts} p
                    INNER JOIN comment_tree ct ON p.parent_id = ct.id
                    WHERE p.type = 'comment'
                  )
                  SELECT id FROM comment_tree
                )`
              )
            )
          );

        const count = comments.length;
        console.log('Comment count result:', count);
        return res.json(count);
      }

      console.log('Fetching comment thread for post:', postId);

      const comments = await db
        .select({
          id: posts.id,
          type: posts.type,
          content: posts.content,
          imageUrl: posts.imageUrl,
          points: posts.points,
          userId: posts.userId,
          parentId: posts.parentId,
          createdAt: posts.createdAt,
          depth: posts.depth,
          author: {
            id: users.id,
            username: users.username,
            imageUrl: users.imageUrl
          }
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(
          and(
            eq(posts.type, 'comment'),
            sql`${posts.id} IN (
              WITH RECURSIVE comment_tree AS (
                SELECT id, parent_id, depth, created_at
                FROM ${posts}
                WHERE parent_id = ${postId}
                AND type = 'comment'

                UNION ALL

                SELECT p.id, p.parent_id, p.depth, p.created_at
                FROM ${posts} p
                INNER JOIN comment_tree ct ON p.parent_id = ct.id
                WHERE p.type = 'comment'
              )
              SELECT id FROM comment_tree
            )`
          )
        )
        .orderBy(
          sql`array_agg(${posts.parentId}) OVER (ORDER BY ${posts.createdAt})`,
          posts.createdAt
        );

      // Create a map to build the comment tree
      const commentMap = new Map();
      const rootComments = [];

      // First pass: create a map of all comments
      comments.forEach(comment => {
        commentMap.set(comment.id, { ...comment, replies: [] });
      });

      // Second pass: build the tree structure
      comments.forEach(comment => {
        const commentWithReplies = commentMap.get(comment.id);
        if (comment.parentId === postId) {
          rootComments.push(commentWithReplies);
        } else {
          const parent = commentMap.get(comment.parentId);
          if (parent) {
            parent.replies.push(commentWithReplies);
          }
        }
      });

      console.log('Comments found:', comments.length);
      console.log('Root comments:', rootComments.length);

      res.json(rootComments);
    } catch (error) {
      console.error('Error fetching comment thread:', error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.get("/api/posts/limits", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      // Get timezone offset from query params (in minutes)
      const tzOffset = parseInt(req.query.tzOffset as string) || 0;

      // Calculate start of user's local day in UTC
      const now = new Date();
      const today = new Date(now.getTime() - tzOffset * 60000);
      today.setUTCHours(0, 0, 0, 0);

      // Calculate end of user's local day in UTC
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

      console.log(`\n=== Checking post limits for user ${req.user.id} ===`);
      console.log('User timezone offset:', tzOffset, 'minutes');
      console.log('Local day start (UTC):', today.toISOString());
      console.log('Local day end (UTC):', tomorrow.toISOString());

      const limits = {
        food: 3,
        workout: 1,
        scripture: 1,
        memory_verse: 1
      };

      const results = await Promise.all(Object.keys(limits).map(async (type) => {
        const [{ count }] = await db
          .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
          .from(posts)
          .where(and(
            eq(posts.userId, req.user.id),
            eq(posts.type, type),
            sql`${posts.createdAt} >= ${today} AND ${posts.createdAt} < ${tomorrow}`
          ));

        console.log(`Found ${count || 0} ${type} posts for today`);
        return { type, count: count || 0 };
      }));

      const counts = {};
      results.forEach(result => counts[result.type] = result.count);

      const response = {
        counts,
        canPost: Object.keys(limits).reduce((acc, type) => {
          acc[type] = counts[type] < limits[type];
          return acc;
        }, {})
      };

      console.log('Sending response:', response);
      console.log('===============================\n');

      res.json(response);
    } catch (error) {
      console.error('Error fetching post limits:', error);
      res.status(500).json({ error: "Failed to fetch post limits" });
    }
  });

  // Measurements
  app.post("/api/measurements", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      // Ensure at least one measurement is provided
      if (req.body.weight === undefined && req.body.waist === undefined) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Please provide at least one measurement'
        });
      }

      const measurementData = insertMeasurementSchema.parse({
        ...req.body,
        userId: req.user.id,
        date: new Date()
      });

      console.log('Creating measurement:', measurementData);

      const measurement = await storage.createMeasurement(measurementData);

      console.log('Measurement created:', measurement);

      res.json(measurement);
    } catch (e) {
      console.error('Error creating measurement:', e);
      if (e instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          details: e.errors
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
          message: e instanceof Error ? e.message : 'Unknown error occurred'
        });
      }
    }
  });

  app.get("/api/measurements", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string) : req.user.id;
      // Only allow admins to view other users' measurements
      if (userId !== req.user.id && !req.user.isAdmin) {
        return res.sendStatus(403);
      }
      const measurements = await storage.getMeasurementsByUser(userId);
      res.json(measurements);
    } catch (error) {
      console.error('Error fetching measurements:', error);
      res.status(500).json({ error: 'Failed to fetch measurements' });
    }
  });

  // User Image Upload
  app.post("/api/user/image", upload.single('image'), async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    if (!req.file) {
      return res.status(400).json({ message: "No image provided" });
    }

    const imageData = req.file.buffer.toString('base64');
    const imageUrl = `data:${req.file.mimetype};base64,${imageData}`;

    try {
      const updatedUser = await storage.updateUserImage(req.user.id, imageUrl);
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user image:', error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  // Notification routes
  app.get("/api/notifications", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const notifications = await storage.getUnreadNotifications(req.user.id);
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const notification = await storage.markNotificationAsRead(parseInt(req.params.id));
      res.json(notification);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: "Failed to mark notification as read", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      // First check if the notification exists and belongs to the user
      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, parseInt(req.params.id)));

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      if (notification.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to delete this notification" });
      }

      await storage.deleteNotification(parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({
        message: "Failed to delete notification",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add endpoint for updating comments
  app.patch("/api/comments/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const commentId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content || content.trim() === '') {
        return res.status(400).json({ message: "Comment content cannot be empty" });
      }

      // First check if the comment exists
      const [comment] = await db
        .select()
        .from(posts)
        .where(and(
          eq(posts.id, commentId),
          eq(posts.type, 'comment')
        ));

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Allow users to update their own comments only
      if (comment.userId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to update this comment" });
      }

      // Update the comment
      const [updatedComment] = await db
        .update(posts)
        .set({ content })
        .where(eq(posts.id, commentId))
        .returning();

      res.json(updatedComment);
    } catch (error) {
      console.error('Error updating comment:', error);
      res.status(500).json({
        message: "Failed to update comment",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add endpoint for deleting comments
  app.delete("/api/comments/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const commentId = parseInt(req.params.id);

      // First check if the comment exists
      const [comment] = await db
        .select()
        .from(posts)
        .where(and(
          eq(posts.id, commentId),
          eq(posts.type, 'comment')
        ));

if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Allow users to delete their own comments or if they are admin
    if (comment.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: "Not authorized to delete this comment" });
    }

    // Delete the comment
    await db.delete(posts).where(eq(posts.id, commentId));

    res.sendStatus(200);
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      message: "Failed to delete comment",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.delete("/api/data", async (req, res) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  try {
    await storage.clearData();
    res.sendStatus(200);
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ error: "Failed to clear data" });
  }
});

app.delete("/api/posts/all", async (req, res) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  try {
    await db.delete(posts);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error deleting posts:', error);
    res.status(500).json({ error: "Failed to delete posts" });
  }
});

// Add team assignment route
app.get("/api/users", async (req, res) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  try {
    const users = await storage.getAllUsers();

    // Calculate program start dates for all users
    const enhancedUsers = await Promise.all(users.map(async (user) => {
      const weekInfo = await storage.getUserWeekInfo(user.id);

      let firstMonday = null;
      if (user.teamJoinedAt) {
        const joinDate = new Date(user.teamJoinedAt);
        const dayOfWeek = joinDate.getDay();
        const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
        firstMonday = new Date(joinDate);
        firstMonday.setDate(joinDate.getDate() + daysUntilMonday);
        firstMonday.setHours(0, 0, 0, 0);
      }

      return {
        ...user,
        weekInfo,
        programStart: firstMonday?.toISOString() || null
      };
    }));

    res.json(enhancedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post("/api/users/:id/team", async (req, res) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  const userId = parseInt(req.params.id);
  const { teamId } = req.body;
  try {
    const user = await storage.updateUserTeam(userId, teamId);
    res.json(user);
  } catch (error) {
    console.error('Error updating user team:', error);
    res.status(500).json({ error: "Failed to update user team" });
  }
});

app.post("/api/users/:id/toggle-admin", async (req, res) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  const userId = parseInt(req.params.id);
  const { isAdmin } = req.body;

  try {
    await db
      .update(users)
      .set({ isAdmin })
      .where(eq(users.id, userId));

    const updatedUser = await storage.getUser(userId);
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: "Failed to update admin status" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  try {
    await storage.deleteUser(parseInt(req.params.id));
    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Add video routes
app.get("/api/videos", async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const videos = await storage.getVideos(req.user.teamId);
    res.json(videos);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({
      message: "Failed to fetch videos",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Activities endpoints
app.get("/api/activities", async (req, res) => {
  const { week, day } = req.query;
  try {
    let query = db
      .select({
        activity: activities,
        workoutVideos: sql<string>`json_agg(
          json_build_object(
            'id', ${workoutVideos}.id,
            'url', ${workoutVideos}.url,
            'description', ${workoutVideos}.description
          )
        )`
      })
      .from(activities)
      .leftJoin(workoutVideos, eq(activities.id, workoutVideos.activityId))
      .groupBy(activities.id);

    if (week) {
      query = query.where(eq(activities.week, Number(week)));
    }
    if (day) {
      query = query.where(eq(activities.day, Number(day)));
    }

    const results = await query;

    // Map the results to include workout videos
    const mappedActivities = results.map(result => ({
      ...result.activity,
      workoutVideos: result.workoutVideos && result.workoutVideos !== '[null]' ?
        (typeof result.workoutVideos === 'string' ?
          JSON.parse(result.workoutVideos) :
          result.workoutVideos)
        : []
    }));

    res.json(mappedActivities);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

app.post("/api/activities", requireAdmin, async (req, res) => {
  try {
    const { workoutVideos, ...activityData } = req.body;
    const parsedActivityData = insertActivitySchema.parse(activityData); // Parse activity data

    // First create the activity
    const [activity] = await db
      .insert(activities)
      .values(parsedActivityData)
      .returning();

    // Then create associated workout videos if any
    if (workoutVideos && workoutVideos.length > 0) {
      await db
        .insert(workoutVideos)
        .values(
          workoutVideos.map((video: { url: string; description: string }) => ({
            activityId: activity.id,
            url: video.url,
            description: video.description
          }))
        );
    }

    // Fetch the complete activity with workout videos
    const [completeActivity] = await db
      .select({
        activity: activities,
        workoutVideos: sql<string>`json_agg(
          json_build_object(
            'id', ${workoutVideos}.id,
            'url', ${workoutVideos}.url,
            'description', ${workoutVideos}.description
          )
        )`
      })
      .from(activities)
      .leftJoin(workoutVideos, eq(activities.id, workoutVideos.activityId))
      .where(eq(activities.id, activity.id))
      .groupBy(activities.id);

    res.status(201).json({
      ...completeActivity.activity,
      workoutVideos: completeActivity.workoutVideos === '[null]' ? [] : JSON.parse(completeActivity.workoutVideos)
    });
  } catch (error) {
    console.error('Error creating activity:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation Error', details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create activity" });
    }
  }
});

app.put("/api/activities/:id", requireAdmin, async (req, res) => {
  try {
    const activityId = parseInt(req.params.id);
    const { workoutVideos: newWorkoutVideos, ...activityData } = req.body;

    // Start transaction to ensure data consistency
    await db.transaction(async (tx) => {
      try {
        // Update activity
        await tx
          .update(activities)
          .set(activityData)
          .where(eq(activities.id, activityId));

        // Handle workout videos within transaction
        await tx
          .delete(workoutVideos)
          .where(eq(workoutVideos.activityId, activityId));

        if (newWorkoutVideos && newWorkoutVideos.length > 0) {
          await tx
            .insert(workoutVideos)
            .values(
              newWorkoutVideos.map((video: { url: string; description: string }) => ({
                activityId,
                url: video.url,
                description: video.description
              }))
            );
        }
      } catch (error) {
        // Rollback on error
        throw error;
      }
    });

    // Fetch updated activity with workout videos after transaction completes
    const [updatedActivity] = await db
      .select({
        activity: activities,
        workoutVideos: sql<string>`COALESCE(
          json_agg(
            json_build_object(
                              'id', ${workoutVideos}.id,
              'url', ${workoutVideos}.url,
              'description', ${workoutVideos}.description
            )
          ) FILTER (WHERE ${workoutVideos}.id IS NOT NULL),
          '[]'::json
        )`
      })
      .from(activities)
      .leftJoin(workoutVideos, eq(activities.id, workoutVideos.activityId))
      .where(eq(activities.id, activityId))
      .groupBy(activities.id);

    if (!updatedActivity) {
      return res.status(404).json({ error: "Activity not found" });
    }

    // Parse the workout videos carefully
    let parsedWorkoutVideos = [];
    try {
      parsedWorkoutVideos = JSON.parse(updatedActivity.workoutVideos);
    } catch (error) {
      console.error('Error parsing workout videos:', error);
      return res.status(500).json({
        error: "Failed to parse workout videos",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    res.json({
      ...updatedActivity.activity,
      workoutVideos: parsedWorkoutVideos
    });
  } catch (error) {
    console.error('Error updating activity:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation Error', details: error.errors });
    } else {
      res.status(500).json({
        error: "Failed to update activity",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

app.delete("/api/activities/:id", requireAdmin, async (req, res) => {
  try {
    await db
      .delete(activities)
      .where(eq(activities.id, parseInt(req.params.id)));
    res.sendStatus(200);
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ error: "Failed to delete activity" });
  }
});

app.post("/api/videos", requireAdmin, async (req, res) => {
  try {
    const videoData = insertVideoSchema.parse(req.body);
    const video = await storage.createVideo(videoData);
    res.status(201).json(video);
  } catch (e) {
    console.error('Error creating video:', e);
    if (e instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: e.errors
      });
    } else {
      res.status(500).json({
        error: 'Internal ServerError',
        message: e instanceof Error ? e.message : 'Unknown error occurred'
      });
    }
  }
});

app.delete("/api/videos/:id", async (req, res) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  try {
    await storage.deleteVideo(parseInt(req.params.id));
    res.sendStatus(200);
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({
      message: "Failed to delete video",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// User
app.get("/api/user", async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const weekInfo = await storage.getUserWeekInfo(req.user.id);

    // Get the user's first Monday (if they're in a team)
    let firstMonday = null;
    if (req.user.teamJoinedAt) {
      const joinDate = new Date(req.user.teamJoinedAt);
      const dayOfWeek = joinDate.getDay();
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
      firstMonday = new Date(joinDate);
      firstMonday.setDate(joinDate.getDate() + daysUntilMonday);
      firstMonday.setHours(0, 0, 0, 0);
    }

    // Get user with accurate point total by only counting existing posts
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        isAdmin: users.isAdmin,
        teamId: users.teamId,
        imageUrl: users.imageUrl,
        points: sql`COALESCE((
          SELECT CAST(SUM(points) AS INTEGER)
          FROM ${posts}
          WHERE user_id = ${users.id}
          AND type != 'comment'
        ), 0)`,
        teamJoinedAt: users.teamJoinedAt
      })
      .from(users)
      .where(eq(users.id, req.user.id));

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Always return points as a number
    const sanitizedUser = {
      ...user,
      points: typeof user.points === 'number' ? user.points : 0,
      weekInfo,
      programStart: firstMonday?.toISOString() || null
    };

    res.json(sanitizedUser);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

app.post("/api/register", async (req, res, next) => {
  try {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const existingEmail = await storage.getUserByEmail(req.body.email);
    if (existingEmail) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
    });

    req.login(user, (err) => {
      if (err) {
        console.error('Login error after registration:', err);
        return next(err);
      }
      res.status(201).json(user);
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.post("/api/users/:id/reset-password", async (req, res) => {
  if (!req.user?.isAdmin) return res.sendStatus(403);
  try {
    const newPassword = req.body.password;
    if (!newPassword) {
      return res.status(400).json({ error: "Password is required" });
    }

    // Hash the new password using the consistent hashing function
    const hashedPassword = await hashPassword(newPassword);

    // Update the user's password
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, parseInt(req.params.id)));

    res.sendStatus(200);
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

app.post("/api/user/password", async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const user = await storage.getUser(req.user.id);
    if (!user || !(await comparePasswords(currentPassword, user.password))) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash and update the new password
    const hashedPassword = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, req.user.id));

    res.sendStatus(200);
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ message: "Failed to update password" });
  }
});

// Fix the malformed status code and simplify WebSocket setup
const httpServer = createServer(app);

// WebSocket server setup with simpler verification
const wss = new WebSocketServer({ 
  server: httpServer, 
  path: '/ws'
});

// Keep track of connected clients with error handling
const clients = new Map<number, WebSocket>();

wss.on('connection', async (ws, req) => {
  try {
    const url = new URL(req.url!, `ws://${req.headers.host}`);
    const userId = parseInt(url.searchParams.get('userId') || '');

    if (isNaN(userId)) {
      console.log('Invalid userId in WebSocket connection');
      ws.close(1008, 'Invalid userId');
      return;
    }

    // Get the user to verify they exist
    const user = await storage.getUser(userId);
    if (!user) {
      console.log('User not found for WebSocket connection:', userId);
      ws.close(1008, 'User not found');
      return;
    }

    console.log('WebSocket connection established for user:', userId);
    console.log('Total active connections:', wss.clients.size);

    // Store the connection
    clients.set(userId, ws);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message from user:', userId, message);
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed for user:', userId);
      clients.delete(userId);
      console.log('Remaining active connections:', wss.clients.size);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error for user:', userId, error);
      clients.delete(userId);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_status',
      status: 'connected',
      userId
    }));

  } catch (error) {
    console.error('Error in WebSocket connection handler:', error);
    ws.close(1011, 'Internal Server Error');
  }
});

// Add test endpoint after existing routes
app.get("/api/points/test", async (req, res) => {
  if (!req.user) return res.sendStatus(401);

  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const { weekStart, weekEnd } = getWeekBounds(date);

    // Get points for specified week
    const [result] = await db
      .select({
        weeklyPoints: sql<number>`COALESCE((
          SELECT CAST(SUM(points) AS INTEGER)
          FROM ${posts}
          WHERE user_id = ${req.user.id}
          AND type != 'comment'
          AND created_at >= ${weekStart}
          AND created_at <= ${weekEnd}
        ), 0)`,
        totalPoints: sql<number>`COALESCE((
          SELECT CAST(SUM(points) AS INTEGER)
          FROM ${posts}
          WHERE user_id = ${req.user.id}
          AND type != 'comment'
        ), 0)`
      })
      .from(users)
      .where(eq(users.id, req.user.id));

    res.json({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      weeklyPoints: result.weeklyPoints,
      totalPoints: result.totalPoints,
      currentDay: date.getDay(), // 0 = Sunday, 1 = Monday, etc.
      isCurrentWeek: date.getTime() === new Date().getTime()
    });
  } catch (error) {
    console.error('Error getting test points:', error);
    res.status(500).json({ error: "Failed to get test points" });
  }
});

// Add this before the activities endpoints
async function getCurrentActivity(req: any, res: any) {
  if (!req.user) return res.sendStatus(401);

  try {
    const weekInfo = await storage.getUserWeekInfo(req.user.id);

    if (!weekInfo) {
      return res.status(404).json({
        message: "No activities available yet. Activities will start on the first Monday after joining a team."
      });
    }

    // Get activity for current week and day
    const [activity] = await db
      .select({
        activity: {
          id: activities.id,
          week: activities.week,
          day: activities.day,
          memoryVerse: activities.memoryVerse,
          memoryVerseReference: activities.memoryVerseReference,
          scripture: activities.scripture,
          workout: activities.workout,
          tasks: activities.tasks,
          description: activities.description,
          isComplete: activities.isComplete,
          completedAt: activities.completedAt,
          createdAt: activities.createdAt
        },
        workoutVideos: sql<string>`
          COALESCE(
            json_agg(
              json_build_object(
                'id', ${workoutVideos.id},
                'url', ${workoutVideos.url},
                'description', ${workoutVideos}.description
              )
            ) FILTER (WHERE ${workoutVideos}.id IS NOT NULL),
            '[]'::json
          )`
      })
      .from(activities)
      .leftJoin(workoutVideos, eq(activities.id, workoutVideos.activityId))
      .where(
        and(
          eq(activities.week, weekInfo.week),
          eq(activities.day, weekInfo.day)
        )
      )
      .groupBy(activities.id);

    if (!activity) {
      return res.status(404).json({
        message: `No activity found for Week ${weekInfo.week}, Day ${weekInfo.day}`
      });
    }

    // Include week info in response
    res.json({
      ...activity,
      currentWeek: weekInfo.week,
      currentDay: weekInfo.day
    });

  } catch (error) {
    console.error('Error fetching current activity:', error);
    res.status(500).json({
      error: "Failed to fetch activity",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// Add new route for current activity
app.get("/api/activities/current", getCurrentActivity);

// Fix the workoutVideos description access
app.get("/api/activities", async (req, res) => {
  const { week, day } = req.query;
  try {
    let query = db
      .select({
        activity: activities,
        workoutVideos: sql`COALESCE(
          array_agg(
            json_build_object(
              'id', ${workoutVideos}.id,
              'url', ${workoutVideos}.url,
              'description', ${workoutVideos}.description
            )
          ) FILTER (WHERE ${workoutVideos}.id IS NOT NULL),
          '[]'::json
        )`
      })
      .from(activities)
      .leftJoin(workoutVideos, eq(activities.id, workoutVideos.activityId))
      .groupBy(activities.id);

    if (week) {
      query = query.where(eq(activities.week, Number(week)));
    }
    if (day) {
      query = query.where(eq(activities.day, Number(day)));
    }

    const results = await query;

    // Map the results to include workout videos
    const mappedActivities = results.map(result => ({
      ...result.activity,
      workoutVideos: result.workoutVideos && result.workoutVideos !== '[null]' ?
        (typeof result.workoutVideos === 'string' ?
          JSON.parse(result.workoutVideos) :
          result.workoutVideos)
        : []
    }));

    res.json(mappedActivities);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});


// Return the HTTP server for Express to use
return httpServer;
}