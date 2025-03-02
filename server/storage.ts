import { users, teams, posts, measurements, notifications, videos, activities, passwordResetTokens } from "@shared/schema";
import type { User, InsertUser, Team, Post, Measurement, Notification, Video, InsertVideo, Activity } from "@shared/schema";
import { eq, desc, and, lt, or, gte, lte } from "drizzle-orm";
import { db } from "./db";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import type { PgSelectQueryBuilder } from 'drizzle-orm/pg-core';
import * as z from 'zod';

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserTeam(userId: number, teamId: number | null): Promise<User>;
  updateUserPoints(userId: number, points: number): Promise<User>;
  updateUserImage(userId: number, imageUrl: string): Promise<User>;
  createTeam(team: Team): Promise<Team>;
  getTeams(): Promise<Team[]>;
  createPost(post: Post): Promise<Post>;
  getPosts(): Promise<Post[]>;
  getAllPosts(): Promise<Post[]>;
  getPostsByTeam(teamId: number): Promise<Post[]>;
  getPostComments(postId: number): Promise<Post[]>;
  deletePost(postId: number): Promise<void>;
  createMeasurement(measurement: Omit<Measurement, 'id'>): Promise<Measurement>;
  getMeasurementsByUser(userId: number): Promise<Measurement[]>;
  createNotification(notification: Omit<Notification, 'id'>): Promise<Notification>;
  getUnreadNotifications(userId: number): Promise<Notification[]>;
  markNotificationAsRead(notificationId: number): Promise<Notification>;
  deleteNotification(notificationId: number): Promise<void>;
  getPostCountByTypeAndDate(userId: number, type: string, date: Date): Promise<number>;
  createVideo(video: InsertVideo): Promise<Video>;
  getVideos(teamId?: number): Promise<Video[]>;
  deleteVideo(videoId: number): Promise<void>;
  clearData(): Promise<void>;
  getAllUsers(): Promise<User[]>;
  getWeeklyPostCount(userId: number, type: string, date: Date): Promise<number>;
  sessionStore: session.Store;
  deleteTeam(teamId: number): Promise<void>;
  getActivities(week?: number, day?: number): Promise<Activity[]>;
  createActivity(data: Activity): Promise<Activity[]>;
  getUserWeekInfo(userId: number): Promise<{ week: number; day: number; isSpartan: boolean; } | null>;
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
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        password: users.password,
        isAdmin: users.isAdmin,
        teamId: users.teamId,
        points: users.points,
        imageUrl: users.imageUrl,
        preferredName: users.preferredName,
        weight: users.weight,
        waist: users.waist,
        createdAt: users.createdAt,
        teamJoinedAt: users.teamJoinedAt
      })
      .from(users)
      .where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        password: users.password,
        isAdmin: users.isAdmin,
        teamId: users.teamId,
        points: users.points,
        imageUrl: users.imageUrl,
        preferredName: users.preferredName,
        weight: users.weight,
        waist: users.waist,
        createdAt: users.createdAt,
        teamJoinedAt: users.teamJoinedAt
      })
      .from(users)
      .where(eq(users.username, username));
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

  async updateUserTeam(userId: number, teamId: number | null): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({
        teamId,
        teamJoinedAt: teamId ? new Date() : null
      })
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
    // Ensure parentId is set to null if not provided
    const postData = {
      ...post,
      parentId: post.parentId || null,
      createdAt: new Date(),
    };

    const [newPost] = await db
      .insert(posts)
      .values(postData)
      .returning();

    return newPost;
  }

  async getPosts(): Promise<Post[]> {
    return await db
      .select({
        id: posts.id,
        type: posts.type,
        content: posts.content,
        imageUrl: posts.imageUrl,
        points: posts.points,
        userId: posts.userId,
        parentId: posts.parentId,
        createdAt: posts.createdAt,
        depth: posts.depth  // Added missing field
      })
      .from(posts)
      .orderBy(desc(posts.createdAt));
  }

  async getAllPosts(): Promise<Post[]> {
    return await db
      .select({
        id: posts.id,
        type: posts.type,
        content: posts.content,
        imageUrl: posts.imageUrl,
        points: posts.points,
        userId: posts.userId,
        parentId: posts.parentId,
        createdAt: posts.createdAt,
        depth: posts.depth  // Added missing field
      })
      .from(posts)
      .orderBy(desc(posts.createdAt));
  }

  async getPostsByTeam(teamId: number): Promise<Post[]> {
    const teamUsers = await db
      .select({
        id: users.id
      })
      .from(users)
      .where(eq(users.teamId, teamId));

    const userIds = teamUsers.map(u => u.id);

    if (userIds.length === 0) return [];

    return await db
      .select({
        id: posts.id,
        type: posts.type,
        content: posts.content,
        imageUrl: posts.imageUrl,
        points: posts.points,
        userId: posts.userId,
        parentId: posts.parentId,
        createdAt: posts.createdAt,
        depth: posts.depth  // Added missing field
      })
      .from(posts)
      .where(
        or(...userIds.map(id => eq(posts.userId, id)))
      )
      .orderBy(desc(posts.createdAt));
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
    try {
      // Explicitly type and structure the notification data
      const notificationData: Omit<Notification, 'id'> = {
        userId: notification.userId,
        title: notification.title,
        message: notification.message,
        read: notification.read ?? false,
        createdAt: notification.createdAt ?? new Date()
      };

      console.log('Creating notification with data:', notificationData);

      const [newNotification] = await db
        .insert(notifications)
        .values(notificationData)
        .returning();

      if (!newNotification) {
        throw new Error('Failed to create notification');
      }

      console.log('Successfully created notification:', newNotification);

      return newNotification;
    } catch (error) {
      console.error('Error creating notification:', error);
      if (error instanceof z.ZodError) {
        console.error('Zod validation error:', error.errors);
      }
      throw error;
    }
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

  async getPostCountByTypeAndDate(userId: number, type: string, date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const userPosts = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          eq(posts.type, type),
          gte(posts.createdAt!, startOfDay),
          lte(posts.createdAt!, endOfDay)
        )
      );

    return userPosts.length;
  }

  async getWeeklyPostCount(userId: number, type: string, date: Date): Promise<number> {
    // Get the start of the week (Sunday)
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Get the end of the week (Saturday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const weeklyPosts = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          eq(posts.type, type),
          gte(posts.createdAt!, startOfWeek),
          lte(posts.createdAt!, endOfWeek)
        )
      );

    return weeklyPosts.length;
  }

  async deleteTeam(teamId: number): Promise<void> {
    // First update all users in this team to have no team
    await db
      .update(users)
      .set({ teamId: null })
      .where(eq(users.teamId, teamId));

    // Then delete the team
    await db
      .delete(teams)
      .where(eq(teams.id, teamId));
  }
  async getPostComments(postId: number): Promise<Post[]> {
    return await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.parentId, postId),
          eq(posts.type, 'comment')
        )
      )
      .orderBy(desc(posts.createdAt));
  }

  async getActivities(week?: number, day?: number): Promise<Activity[]> {
    let queryBuilder = db
      .select()
      .from(activities) as PgSelectQueryBuilder<
        typeof activities,
        Record<string, unknown>
      >;

    if (week !== undefined) {
      queryBuilder = queryBuilder.where(eq(activities.week, week));
      if (day !== undefined) {
        queryBuilder = queryBuilder.where(
          and(eq(activities.week, week), eq(activities.day, day))
        );
      }
    }

    return await queryBuilder;
  }

  async createActivity(data: Activity): Promise<Activity[]> {
    return await db.insert(activities).values(data).returning();
  }

  async getUserWeekInfo(userId: number): Promise<{ week: number; day: number; isSpartan: boolean; } | null> {
    const [user] = await db
      .select({
        teamJoinedAt: users.teamJoinedAt,
        teamId: users.teamId
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.teamId || !user?.teamJoinedAt) {
      console.log('User not in team or no join date:', { userId });
      return null;
    }

    // Get join date and today, normalize to UTC midnight
    const joinDate = new Date(user.teamJoinedAt);
    joinDate.setUTCHours(0, 0, 0, 0);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Find the first Monday after join (when program starts)
    let firstMonday = new Date(joinDate);
    while (firstMonday.getUTCDay() !== 1) { // 1 = Monday
      firstMonday.setUTCDate(firstMonday.getUTCDate() + 1);
    }

    // If we haven't reached the first Monday yet, calculate negative days
    if (today < firstMonday) {
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysBeforeStart = Math.floor((firstMonday.getTime() - today.getTime()) / msPerDay);

      console.log('Before program start:', {
        userId,
        today: today.toISOString(),
        firstMonday: firstMonday.toISOString(),
        daysBeforeStart: -daysBeforeStart // Convert to negative number
      });

      return {
        week: 0,
        day: -daysBeforeStart, // Will be 0 for Sunday, -1 for Saturday, etc.
        isSpartan: false
      };
    }

    // Calculate days since program start (first Monday = day 1)
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSinceStart = Math.floor((today.getTime() - firstMonday.getTime()) / msPerDay) + 1;

    // Calculate week (1-based) and day (1-7, Monday to Sunday)
    const week = Math.floor((daysSinceStart - 1) / 7) + 1;
    const day = ((daysSinceStart - 1) % 7) + 1;

    // Spartan status after 84 days
    const isSpartan = daysSinceStart >= 84;

    console.log('Program progress:', {
      userId,
      daysSinceStart,
      week,
      day,
      isSpartan
    });

    return { week, day, isSpartan };
  }
}

export const storage = new DatabaseStorage();