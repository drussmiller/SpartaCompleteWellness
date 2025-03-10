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
  type WorkoutVideo,
  type InsertTeam,
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

  async createTeam(teamData: InsertTeam): Promise<Team> {
    try {
      const [newTeam] = await db
        .insert(teams)
        .values({
          name: teamData.name,
          description: teamData.description,
          createdAt: new Date()
        })
        .returning();
      return newTeam;
    } catch (error) {
      logger.error(`Failed to create team: ${error}`);
      throw error;
    }
  },

  // Users
  async getUserByUsername(username: string): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.username}) = LOWER(${username})`)
        .limit(1);
      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to get user by username ${username}: ${error}`);
      throw error;
    }
  },

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${email})`)
        .limit(1);
      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to get user by email ${email}: ${error}`);
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
  async createNotification(data: Omit<Notification, "id">): Promise<Notification> {
    try {
      logger.debug("Creating notification:", data);
      const [notification] = await db
        .insert(notifications)
        .values({
          userId: data.userId,
          title: data.title,
          message: data.message,
          read: data.read ?? false,
          createdAt: data.createdAt || new Date()
        })
        .returning();
      logger.debug("Notification created successfully:", notification);
      return notification;
    } catch (error) {
      logger.error(`Failed to create notification: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  },

  async getNotifications(userId: number): Promise<Notification[]> {
    try {
      return await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));
    } catch (error) {
      logger.error(`Failed to get notifications for user ${userId}: ${error}`);
      throw error;
    }
  },

  async markNotificationAsRead(id: number): Promise<void> {
    try {
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, id));
    } catch (error) {
      logger.error(`Failed to mark notification ${id} as read: ${error}`);
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

      const results = await query.orderBy(activities.week, activities.day);
      return results.map(result => ({
        ...result,
        contentFields: result.contentFields as Activity['contentFields']
      }));
    } catch (error) {
      logger.error(`Failed to get activities: ${error}`);
      throw error;
    }
  },

  async createActivity(data: Omit<Activity, "id" | "createdAt">): Promise<Activity> {
    try {
      const [activity] = await db
        .insert(activities)
        .values({
          ...data,
          createdAt: new Date(),
          contentFields: data.contentFields || []
        })
        .returning();
      return {
        ...activity,
        contentFields: activity.contentFields as Activity['contentFields']
      };
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

  async createPost(data: Omit<Post, "id">): Promise<Post> {
    try {
      logger.debug("Creating post with data:", data);
      const [post] = await db
        .insert(posts)
        .values({
          userId: data.userId,
          type: data.type,
          content: data.content,
          imageUrl: data.imageUrl,
          parentId: data.parentId,
          depth: data.depth || 0,
          points: data.points || 1,
          createdAt: data.createdAt || new Date()
        })
        .returning();
      logger.debug("Post created successfully:", post);
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
  async createReaction(data: Omit<Reaction, "id" | "createdAt">): Promise<Reaction> {
    try {
      const [reaction] = await db
        .insert(reactions)
        .values({
          ...data,
          createdAt: new Date()
        })
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

  // Add deleteUser method to storage adapter
  async deleteUser(userId: number): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Delete all reactions by this user
        await tx
          .delete(reactions)
          .where(eq(reactions.userId, userId));

        // Delete all comments by this user
        await tx
          .delete(posts)
          .where(and(
            eq(posts.userId, userId),
            sql`${posts.parentId} IS NOT NULL`
          ));

        // Delete all posts by this user
        await tx
          .delete(posts)
          .where(eq(posts.userId, userId));

        // Delete all notifications for this user
        await tx
          .delete(notifications)
          .where(eq(notifications.userId, userId));

        // Finally delete the user
        await tx
          .delete(users)
          .where(eq(users.id, userId));
      });
    } catch (error) {
      logger.error(`Failed to delete user ${userId}: ${error}`);
      throw error;
    }
  },
  sessionStore: new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
  }),
  async getPostComments(postId: number): Promise<(Post & { author: User })[]> {
    try {
      // Get all comments for this post with author information
      const result = await db
        .select({
          id: posts.id,
          userId: posts.userId,
          type: posts.type,
          content: posts.content,
          imageUrl: posts.imageUrl,
          points: posts.points,
          createdAt: posts.createdAt,
          parentId: posts.parentId,
          depth: posts.depth,
          author: {
            id: users.id,
            username: users.username,
            imageUrl: users.imageUrl,
          }
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(
          or(
            eq(posts.parentId, postId),
            sql`${posts.id} IN (
              WITH RECURSIVE comment_tree AS (
                SELECT id FROM ${posts} WHERE parent_id = ${postId}
                UNION ALL
                SELECT p.id FROM ${posts} p
                INNER JOIN comment_tree ct ON p.parent_id = ct.id
              )
              SELECT id FROM comment_tree
            )`
          )
        )
        .orderBy(desc(posts.createdAt));

      return result;
    } catch (error) {
      logger.error(`Failed to get comments for post ${postId}: ${error}`);
      throw error;
    }
  },

  async createComment(data: Omit<Post, "id">): Promise<Post> {
    try {
      logger.debug("Creating comment with data:", data);
      if (!data.userId || !data.content || !data.parentId) {
        throw new Error("Missing required fields for comment");
      }

      const [comment] = await db
        .insert(posts)
        .values({
          userId: data.userId,
          type: "comment",
          content: data.content,
          parentId: data.parentId,
          depth: data.depth || 0,
          points: 1,
          createdAt: new Date()
        })
        .returning();
      logger.debug("Comment created successfully:", comment);
      return comment;
    } catch (error) {
      logger.error(`Failed to create comment: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  },
  async createMissedPostsNotification(userId: number, missingPosts: {
    food: number;
    workout: number;
    scripture: number;
  }): Promise<Notification | null> {
    // Skip if no posts are missing
    if (missingPosts.food <= 0 && missingPosts.workout <= 0 && missingPosts.scripture <= 0) {
      return null;
    }

    // Build notification message based on what's missing
    let message = "Yesterday you missed: ";
    const missing: string[] = [];

    if (missingPosts.food > 0) {
      missing.push(`${missingPosts.food} Food post${missingPosts.food > 1 ? 's' : ''}`);
    }
    if (missingPosts.workout > 0) {
      missing.push(`${missingPosts.workout} Workout post`);
    }
    if (missingPosts.scripture > 0) {
      missing.push(`${missingPosts.scripture} Scripture post`);
    }

    message += missing.join(", ");

    return this.createNotification({
      userId,
      title: "Missing Daily Posts",
      message,
      read: false,
      createdAt: new Date()
    });
  },
};