import { db } from "./db";
import { eq, and, desc, sql, gte, lte, or, isNull } from "drizzle-orm";
import {
  posts,
  teams,
  users,
  activities,
  reactions,
  notifications,
  measurements,
  workoutVideos,
  type Post,
  type Team,
  type User,
  type Activity,
  type Reaction,
  type Notification,
  type Measurement,
  type WorkoutVideo
} from "@shared/schema";
import { logger } from "./logger";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPgSimple(session);

// Storage adapter for database operations
export const storage = {
  // Teams
  async getTeams(): Promise<Team[]> {
    try {
      return await db.select().from(teams);
    } catch (error) {
      logger.error(`Failed to get teams: ${error}`);
      throw error;
    }
  },

  // Users
  async getUserByUsername(username: string): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to get user by username ${username}: ${error}`);
      throw error;
    }
  },

  async getUser(id: number): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to get user ${id}: ${error}`);
      throw error;
    }
  },

  async getAllUsers(): Promise<User[]> {
    try {
      return await db.select().from(users);
    } catch (error) {
      logger.error(`Failed to get all users: ${error}`);
      throw error;
    }
  },

  async getAdminUsers(): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .where(eq(users.isAdmin, true));
    } catch (error) {
      logger.error(`Failed to get admin users: ${error}`);
      throw error;
    }
  },

  async createUser(data: Omit<User, "id" | "createdAt">): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values({ ...data, createdAt: new Date() })
        .returning();
      return user;
    } catch (error) {
      logger.error(`Failed to create user: ${error}`);
      throw error;
    }
  },

  // Notifications
  async createNotification(data: Omit<Notification, "id" | "createdAt">): Promise<Notification> {
    try {
      const [notification] = await db
        .insert(notifications)
        .values({ ...data, createdAt: new Date() })
        .returning();
      return notification;
    } catch (error) {
      logger.error(`Failed to create notification: ${error}`);
      throw error;
    }
  },

  // Activities
  async getActivities(week?: number, day?: number): Promise<Activity[]> {
    try {
      let query = db.select().from(activities);

      if (week !== undefined) {
        query = query.where(eq(activities.week, week));
      }

      if (day !== undefined) {
        query = query.where(eq(activities.day, day));
      }

      return await query.orderBy(activities.week, activities.day);
    } catch (error) {
      logger.error(`Failed to get activities: ${error}`);
      throw error;
    }
  },

  async createActivity(data: Partial<Activity>): Promise<Activity> {
    try {
      const [activity] = await db.insert(activities).values(data).returning();
      return activity;
    } catch (error) {
      logger.error(`Failed to create activity: ${error}`);
      throw error;
    }
  },

  async deleteActivity(id: number): Promise<void> {
    try {
      await db.delete(activities).where(eq(activities.id, id));
    } catch (error) {
      logger.error(`Failed to delete activity ${id}: ${error}`);
      throw error;
    }
  },

    // Posts
  async getAllPosts(): Promise<Post[]> {
    try {
      logger.debug("Getting all posts");
      // Get all top-level posts (not comments) sorted by newest first
      const result = await db
        .select()
        .from(posts)
        .where(isNull(posts.parentId))
        .orderBy(desc(posts.createdAt));

      logger.debug(`Retrieved ${result.length} posts`);
      return result;
    } catch (error) {
      logger.error(`Failed to get all posts: ${error}`);
      throw error;
    }
  },

  async getPosts(userId?: number): Promise<Post[]> {
    try {
      if (userId) {
        return await db
          .select()
          .from(posts)
          .where(eq(posts.userId, userId))
          .orderBy(desc(posts.createdAt));
      } else {
        return await db
          .select()
          .from(posts)
          .orderBy(desc(posts.createdAt));
      }
    } catch (error) {
      logger.error(`Failed to get posts: ${error}`);
      throw error;
    }
  },

  async createPost(data: Partial<Post>): Promise<Post> {
    try {
      logger.debug("Creating post with data:", data);
      const [post] = await db
        .insert(posts)
        .values({ ...data, createdAt: new Date() })
        .returning();
      logger.debug("Post created successfully:", post.id);
      return post;
    } catch (error) {
      logger.error(`Failed to create post: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  },

  async deletePost(id: number): Promise<void> {
    try {
      await db.delete(posts).where(eq(posts.id, id));
    } catch (error) {
      logger.error(`Failed to delete post ${id}: ${error}`);
      throw error;
    }
  },

  // Reactions
  async createReaction(data: { userId: number; postId: number; type: string }): Promise<Reaction> {
    try {
      const [reaction] = await db
        .insert(reactions)
        .values({ ...data, createdAt: new Date() })
        .returning();
      return reaction;
    } catch (error) {
      logger.error(`Failed to create reaction: ${error}`);
      throw error;
    }
  },

  async deleteReaction(userId: number, postId: number, type: string): Promise<void> {
    try {
      await db
        .delete(reactions)
        .where(
          and(
            eq(reactions.userId, userId),
            eq(reactions.postId, postId),
            eq(reactions.type, type)
          )
        );
    } catch (error) {
      logger.error(`Failed to delete reaction: ${error}`);
      throw error;
    }
  },

  async getReactionsByPost(postId: number): Promise<Reaction[]> {
    try {
      return await db
        .select()
        .from(reactions)
        .where(eq(reactions.postId, postId));
    } catch (error) {
      logger.error(`Failed to get reactions for post ${postId}: ${error}`);
      throw error;
    }
  },
  sessionStore: new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
  })
};