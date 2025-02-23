import { users, teams, posts, measurements, notifications } from "@shared/schema";
import type { User, InsertUser, Team, Post, Measurement, Notification } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserTeam(userId: number, teamId: number): Promise<User>;
  updateUserPoints(userId: number, points: number): Promise<User>;

  // Team operations
  createTeam(team: Team): Promise<Team>;
  getTeams(): Promise<Team[]>;

  // Post operations
  createPost(post: Post): Promise<Post>;
  getPosts(): Promise<Post[]>;
  getAllPosts(): Promise<Post[]>; 
  getPostsByTeam(teamId: number): Promise<Post[]>;

  // Measurement operations
  createMeasurement(measurement: Omit<Measurement, 'id'>): Promise<Measurement>;
  getMeasurementsByUser(userId: number): Promise<Measurement[]>;

  // Notification operations
  createNotification(notification: Omit<Notification, 'id'>): Promise<Notification>;
  getUnreadNotifications(userId: number): Promise<Notification[]>;
  markNotificationAsRead(notificationId: number): Promise<Notification>;

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

  async createTeam(team: Team): Promise<Team> {
    const [newTeam] = await db.insert(teams).values(team).returning();
    return newTeam;
  }

  async getTeams(): Promise<Team[]> {
    return await db.select().from(teams);
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

  async getPostsByTeam(teamId: number): Promise<Post[]> {
    const teamUsers = await db.select().from(users).where(eq(users.teamId, teamId));
    const userIds = teamUsers.map(u => u.id);
    return await db.select().from(posts).where(
      userIds.map(id => eq(posts.userId, id))
    );
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
      .where(eq(notifications.userId, userId))
      .where(eq(notifications.read, false));
  }

  async markNotificationAsRead(notificationId: number): Promise<Notification> {
    const [updatedNotification] = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, notificationId))
      .returning();
    return updatedNotification;
  }
}

export const storage = new DatabaseStorage();