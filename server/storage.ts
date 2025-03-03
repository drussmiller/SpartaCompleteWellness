import session from 'express-session';
import memorystore from 'memorystore';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { 
  InsertPost, InsertUser, InsertReaction 
} from '@shared/schema';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Initialize database connection
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

// Set up session store
const MemoryStore = memorystore(session);
const sessionStore = new MemoryStore({
  checkPeriod: 86400000 // Prune expired entries every 24h
});

// Storage service for all database operations
export const storage = {
  sessionStore,

  // User operations
  async getUser(id: number) {
    try {
      const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
      return result[0] || null;
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  },

  async getUserByUsername(username: string) {
    try {
      const result = await db.select().from(schema.users).where(eq(schema.users.username, username));
      return result[0] || null;
    } catch (error) {
      console.error('Error getting user by username:', error);
      throw error;
    }
  },

  async createUser(user: InsertUser) {
    try {
      const result = await db.insert(schema.users).values(user).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  async updateUser(id: number, data: Partial<InsertUser>) {
    try {
      const result = await db.update(schema.users)
        .set(data)
        .where(eq(schema.users.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  async getAllUsers() {
    try {
      return db.select().from(schema.users).orderBy(schema.users.username);
    } catch (error) {
      console.error('Error getting all users:', error);
      throw error;
    }
  },

  // Post operations
  async getAllPosts() {
    try {
      return db.select().from(schema.posts).orderBy(desc(schema.posts.createdAt));
    } catch (error) {
      console.error('Error getting all posts:', error);
      throw error;
    }
  },

  async getPost(id: number) {
    try {
      const result = await db.select()
        .from(schema.posts)
        .where(eq(schema.posts.id, id));
      return result[0] || null;
    } catch (error) {
      console.error('Error getting post:', error);
      throw error;
    }
  },

  async createPost(post: InsertPost) {
    try {
      const result = await db.insert(schema.posts).values(post).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating post:', error);
      throw error;
    }
  },

  async updatePost(id: number, data: Partial<InsertPost>) {
    try {
      const result = await db.update(schema.posts)
        .set(data)
        .where(eq(schema.posts.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error('Error updating post:', error);
      throw error;
    }
  },

  async deletePost(id: number) {
    try {
      const result = await db.delete(schema.posts)
        .where(eq(schema.posts.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error('Error deleting post:', error);
      throw error;
    }
  },

  // Reaction operations
  async getPostReactions(postId: number) {
    try {
      return db.select()
        .from(schema.reactions)
        .where(eq(schema.reactions.postId, postId))
        .leftJoin(schema.users, eq(schema.reactions.userId, schema.users.id));
    } catch (error) {
      console.error('Error getting post reactions:', error);
      throw error;
    }
  },

  async getReaction(userId: number, postId: number) {
    try {
      const result = await db.select()
        .from(schema.reactions)
        .where(and(
          eq(schema.reactions.userId, userId),
          eq(schema.reactions.postId, postId)
        ));
      return result[0] || null;
    } catch (error) {
      console.error('Error getting reaction:', error);
      throw error;
    }
  },

  async createReaction(reaction: InsertReaction) {
    try {
      const result = await db.insert(schema.reactions).values(reaction).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating reaction:', error);
      throw error;
    }
  },
  async getReactionsByEmoji(postId: number) {
    try {
      const result = await db.select({
        emoji: schema.reactions.emoji,
        count: sql<number>`count(*)`,
      })
      .from(schema.reactions)
      .where(eq(schema.reactions.postId, postId))
      .groupBy(schema.reactions.emoji);
      
      return result;
    } catch (error) {
      console.error('Error getting reactions by emoji:', error);
      throw error;
    }
  },
  
  async getReactionUsers(postId: number, emoji: string) {
    try {
      return db.select({
        userId: schema.users.id,
        username: schema.users.username,
        preferredName: schema.users.preferredName,
      })
      .from(schema.reactions)
      .where(and(
        eq(schema.reactions.postId, postId),
        eq(schema.reactions.emoji, emoji)
      ))
      .innerJoin(schema.users, eq(schema.reactions.userId, schema.users.id));
    } catch (error) {
      console.error('Error getting reaction users:', error);
      throw error;
    }
  }
};