import { Database } from 'better-sqlite3';
import session from 'express-session';
import SqliteStore from 'better-sqlite3-session-store';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as schema from './db/schema';
import BetterSqlite3 from 'better-sqlite3';
import { 
  InsertPost, InsertUser, InsertTeam, InsertMeasurement, 
  InsertComment, InsertReaction 
} from '@shared/schema';

// Initialize database connection
const sqlite = new BetterSqlite3('sqlite.db');
const db = drizzle(sqlite, { schema });

// Set up session store
const Store = SqliteStore(session);
const sessionStore = new Store({
  client: sqlite,
  expired: {
    clear: true,
    intervalMs: 900000 // 15min
  }
});

// Storage service for all database operations
export const storage = {
  sessionStore,
  
  // User operations
  async getUser(id: number) {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return result[0] || null;
  },
  
  async getUserByUsername(username: string) {
    const result = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return result[0] || null;
  },
  
  async createUser(user: InsertUser) {
    const result = await db.insert(schema.users).values(user).returning();
    return result[0];
  },
  
  async updateUser(id: number, data: Partial<InsertUser>) {
    const result = await db.update(schema.users).set(data).where(eq(schema.users.id, id)).returning();
    return result[0];
  },
  
  async getAllUsers() {
    return db.select().from(schema.users).orderBy(schema.users.username);
  },
  
  // Team operations
  async getTeam(id: number) {
    const result = await db.select().from(schema.teams).where(eq(schema.teams.id, id));
    return result[0] || null;
  },
  
  async getAllTeams() {
    return db.select().from(schema.teams);
  },
  
  async createTeam(team: InsertTeam) {
    const result = await db.insert(schema.teams).values(team).returning();
    return result[0];
  },
  
  async updateTeam(id: number, data: Partial<InsertTeam>) {
    const result = await db.update(schema.teams).set(data).where(eq(schema.teams.id, id)).returning();
    return result[0];
  },
  
  async deleteTeam(id: number) {
    // Update any users in this team to have null teamId
    await db.update(schema.users).set({ teamId: null }).where(eq(schema.users.teamId, id));
    
    // Delete the team
    const result = await db.delete(schema.teams).where(eq(schema.teams.id, id)).returning();
    return result[0];
  },
  
  // Post operations
  async createPost(post: InsertPost) {
    const result = await db.insert(schema.posts).values(post).returning();
    return result[0];
  },
  
  async getAllPosts() {
    return db.select()
      .from(schema.posts)
      .leftJoin(schema.users, eq(schema.posts.userId, schema.users.id))
      .orderBy(desc(schema.posts.createdAt));
  },
  
  async getPost(id: number) {
    const result = await db.select()
      .from(schema.posts)
      .where(eq(schema.posts.id, id))
      .leftJoin(schema.users, eq(schema.posts.userId, schema.users.id));
    return result[0] || null;
  },
  
  async updatePost(id: number, data: Partial<InsertPost>) {
    const result = await db.update(schema.posts).set(data).where(eq(schema.posts.id, id)).returning();
    return result[0];
  },
  
  async deletePost(id: number) {
    // Delete associated comments and reactions first
    await db.delete(schema.comments).where(eq(schema.comments.postId, id));
    await db.delete(schema.reactions).where(eq(schema.reactions.postId, id));
    
    const result = await db.delete(schema.posts).where(eq(schema.posts.id, id)).returning();
    return result[0];
  },
  
  // Comment operations
  async createComment(comment: InsertComment) {
    const result = await db.insert(schema.comments).values(comment).returning();
    return result[0];
  },
  
  async getPostComments(postId: number) {
    return db.select()
      .from(schema.comments)
      .where(eq(schema.comments.postId, postId))
      .leftJoin(schema.users, eq(schema.comments.userId, schema.users.id))
      .orderBy(schema.comments.createdAt);
  },
  
  async countPostComments(postId: number) {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.comments)
      .where(eq(schema.comments.postId, postId));
    return result[0]?.count || 0;
  },
  
  // Measurement operations
  async createMeasurement(measurement: InsertMeasurement) {
    const result = await db.insert(schema.measurements).values(measurement).returning();
    return result[0];
  },
  
  async getUserMeasurements(userId: number) {
    return db.select()
      .from(schema.measurements)
      .where(eq(schema.measurements.userId, userId))
      .orderBy(schema.measurements.date);
  },
  
  // Reaction operations
  async getPostReactions(postId: number) {
    return db.select()
      .from(schema.reactions)
      .where(eq(schema.reactions.postId, postId))
      .leftJoin(schema.users, eq(schema.reactions.userId, schema.users.id));
  },
  
  async getReaction(userId: number, postId: number) {
    const result = await db.select()
      .from(schema.reactions)
      .where(and(
        eq(schema.reactions.userId, userId),
        eq(schema.reactions.postId, postId)
      ));
    return result[0] || null;
  },
  
  async createReaction(reaction: InsertReaction) {
    // Check if the user already has a reaction on this post
    const existing = await this.getReaction(reaction.userId, reaction.postId);
    
    if (existing) {
      // If trying to add the same reaction, remove it
      if (existing.emoji === reaction.emoji) {
        const result = await db.delete(schema.reactions)
          .where(eq(schema.reactions.id, existing.id))
          .returning();
        return result[0];
      }
      
      // Otherwise update the existing reaction
      const result = await db.update(schema.reactions)
        .set({ emoji: reaction.emoji })
        .where(eq(schema.reactions.id, existing.id))
        .returning();
      return result[0];
    }
    
    // Create a new reaction
    const result = await db.insert(schema.reactions).values(reaction).returning();
    return result[0];
  },
  
  async getReactionsByEmoji(postId: number) {
    const result = await db.select({
      emoji: schema.reactions.emoji,
      count: sql<number>`count(*)`,
    })
    .from(schema.reactions)
    .where(eq(schema.reactions.postId, postId))
    .groupBy(schema.reactions.emoji);
    
    return result;
  },
  
  async getReactionUsers(postId: number, emoji: string) {
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
  }
};