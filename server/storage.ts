import { users, teams, posts, measurements, notifications, videos, passwordResetTokens } from "@shared/schema";
import type { User, InsertUser, Team, Post, Measurement, Notification, Video, InsertVideo, PasswordResetToken } from "@shared/schema";
import { eq, desc, and, lt, or } from "drizzle-orm";
import { db } from "./db";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserTeam(userId: number, teamId: number): Promise<User>;
  updateUserPoints(userId: number, points: number): Promise<User>;
  updateUserImage(userId: number, imageUrl: string): Promise<User>;

  // Password reset operations
  storeResetToken(email: string, token: string, expiry: Date): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<boolean>;

  // Team operations
  createTeam(team: Team): Promise<Team>;
  getTeams(): Promise<Team[]>;

  // Post operations
  createPost(post: Post): Promise<Post>;
  getPosts(): Promise<Post[]>;
  getAllPosts(): Promise<Post[]>; 
  getPostsByTeam(teamId: number): Promise<Post[]>;
  deletePost(postId: number): Promise<void>;

  // Measurement operations
  createMeasurement(measurement: Omit<Measurement, 'id'>): Promise<Measurement>;
  getMeasurementsByUser(userId: number): Promise<Measurement[]>;

  // Notification operations
  createNotification(notification: Omit<Notification, 'id'>): Promise<Notification>;
  getUnreadNotifications(userId: number): Promise<Notification[]>;
  markNotificationAsRead(notificationId: number): Promise<Notification>;
  deleteNotification(notificationId: number): Promise<void>;

  // Video operations
  createVideo(video: InsertVideo): Promise<Video>;
  getVideos(teamId?: number): Promise<Video[]>;
  deleteVideo(videoId: number): Promise<void>;

  // Clear all data (admin only)
  clearData(): Promise<void>;

  getAllUsers(): Promise<User[]>;

  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUserTeam(userId: number, teamId: number): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ teamId })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async updateUserPoints(userId: number, points: number): Promise<User> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const [updatedUser] = await db
      .update(users)
      .set({ points: (user?.points || 0) + points })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async updateUserImage(userId: number, imageUrl: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ imageUrl })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async clearData(): Promise<void> {
    await db.delete(notifications);
    await db.delete(measurements);
    await db.delete(posts);
    await db.delete(users);
    await db.delete(teams);
    await db.delete(passwordResetTokens);
  }

  async createTeam(team: Team): Promise<Team> {
    const [newTeam] = await db.insert(teams).values(team).returning();
    return newTeam;
  }

  async getTeams(): Promise<Team[]> {
    return await db.select().from(teams);
  }

  async getUserWithTeam(userId: number) {
    const [user] = await db
      .select({
        ...users,
        teamName: teams.name
      })
      .from(users)
      .leftJoin(teams, eq(users.teamId, teams.id))
      .where(eq(users.id, userId));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createPost(post: Post): Promise<Post> {
    const [newPost] = await db.insert(posts).values(post).returning();
    return newPost;
  }

  async getPosts(): Promise<Post[]> {
    return await db.select().from(posts);
  }

  async getAllPosts(): Promise<Post[]> { 
    return await db.select().from(posts).orderBy(desc(posts.createdAt));
  }

  async updateUserTeam(userId: number, teamId: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ teamId })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getPostsByTeam(teamId: number): Promise<Post[]> {
    const teamUsers = await db.select().from(users).where(eq(users.teamId, teamId));
    const userIds = teamUsers.map(u => u.id);
    if (userIds.length === 0) return [];
    return await db
      .select()
      .from(posts)
      .where(or(...userIds.map(id => eq(posts.userId, id))));
  }

  async createMeasurement(measurement: Omit<Measurement, 'id'>): Promise<Measurement> {
    const [newMeasurement] = await db
      .insert(measurements)
      .values({
        userId: measurement.userId,
        weight: measurement.weight || null,
        waist: measurement.waist || null,
        date: measurement.date || new Date(),
      })
      .returning();
    return newMeasurement;
  }

  async getMeasurementsByUser(userId: number): Promise<Measurement[]> {
    return await db.select().from(measurements).where(eq(measurements.userId, userId));
  }

  async createNotification(notification: Omit<Notification, 'id'>): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async getUnreadNotifications(userId: number): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.read, false)
      ));
  }

  async markNotificationAsRead(notificationId: number): Promise<Notification> {
    const [updatedNotification] = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, notificationId))
      .returning();
    return updatedNotification;
  }

  async deletePost(postId: number): Promise<void> {
    await db.delete(posts).where(eq(posts.id, postId));
  }

  async deleteNotification(notificationId: number): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, notificationId));
  }

  async createVideo(video: InsertVideo): Promise<Video> {
    const [newVideo] = await db.insert(videos).values(video).returning();
    return newVideo;
  }

  async getVideos(teamId?: number): Promise<Video[]> {
    if (teamId) {
      return await db
        .select()
        .from(videos)
        .where(eq(videos.teamId, teamId))
        .orderBy(desc(videos.createdAt));
    }
    return await db
      .select()
      .from(videos)
      .orderBy(desc(videos.createdAt));
  }

  async deleteVideo(videoId: number): Promise<void> {
    await db.delete(videos).where(eq(videos.id, videoId));
  }

  async storeResetToken(email: string, token: string, expiry: Date): Promise<void> {
    // First invalidate any existing tokens
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.email, email));

    // Store new token
    await db.insert(passwordResetTokens).values({
      email,
      token,
      expiresAt: expiry,
      used: false,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      // Get token and check if it's valid
      const [resetToken] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, token),
            eq(passwordResetTokens.used, false),
            lt(new Date(), passwordResetTokens.expiresAt) 
          )
        );

      if (!resetToken) {
        console.log('Invalid or expired reset token');
        return false;
      }

      // Mark token as used
      await db
        .update(passwordResetTokens)
        .set({ used: true })
        .where(eq(passwordResetTokens.id, resetToken.id));

      // Get user and update password
      const user = await this.getUserByEmail(resetToken.email);
      if (!user) {
        console.log('User not found for email:', resetToken.email);
        return false;
      }

      // Hash new password
      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(newPassword, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Update user password
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, user.id));

      return true;
    } catch (error) {
      console.error('Error in resetPassword:', error);
      return false;
    }
  }
}

export const storage = new DatabaseStorage();