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
import connectPg from "connect-pg-simple";
import { pool } from "./db";

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

  async createTeam(data: Partial<Team>): Promise<Team> {
    try {
      const [team] = await db.insert(teams).values(data).returning();
      return team;
    } catch (error) {
      logger.error(`Failed to create team: ${error}`);
      throw error;
    }
  },

  async deleteTeam(id: number): Promise<void> {
    try {
      await db.delete(teams).where(eq(teams.id, id));
    } catch (error) {
      logger.error(`Failed to delete team ${id}: ${error}`);
      throw error;
    }
  },

  // Users
  async getUser(id: number): Promise<User | null> {
    try {
      const user = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return user[0] || null;
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
      const [post] = await db.insert(posts).values(data).returning();
      logger.debug("Post created successfully:", post.id);
      return post;
    } catch (error) {
      logger.error(`Failed to create post: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  },

  async deletePost(id: number): Promise<void> {
    try {
      // First delete all child posts/comments
      await db.delete(posts).where(eq(posts.parentId, id));

      // Then delete the post itself
      await db.delete(posts).where(eq(posts.id, id));
    } catch (error) {
      logger.error(`Failed to delete post ${id}: ${error}`);
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

  // Reactions
  async createReaction(data: { userId: number; postId: number; type: string }): Promise<Reaction> {
    try {
      // Delete any existing reaction from this user on this post
      await db
        .delete(reactions)
        .where(
          and(
            eq(reactions.userId, data.userId),
            eq(reactions.postId, data.postId)
          )
        );

      // Create the new reaction
      const [reaction] = await db.insert(reactions).values(data).returning();
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