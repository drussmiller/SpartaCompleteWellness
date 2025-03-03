import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  preferredName: text("preferred_name"),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false),
  isTeamLead: boolean("is_team_lead").default(false),
  teamId: integer("team_id"),
  points: integer("points").default(0),
  weight: integer("weight"),
  waist: integer("waist"),
  createdAt: timestamp("created_at").defaultNow(),
  imageUrl: text("image_url"),
  teamJoinedAt: timestamp("team_joined_at"),
  currentWeek: integer("current_week").default(1),
  currentDay: integer("current_day").default(1),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Create insert schema for teams with proper validation
export const insertTeamSchema = createInsertSchema(teams).extend({
  name: z.string().min(1, "Team name is required"),
  description: z.string().optional(),
});

// Types
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type", { enum: ["food", "workout", "scripture", "memory_verse", "comment"] }).notNull(),
  content: text("content"),
  imageUrl: text("image_url"),
  points: integer("points").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  parentId: integer("parent_id"),
  depth: integer("depth").default(0),
});

export const measurements = pgTable("measurements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  weight: integer("weight"),
  waist: integer("waist"),
  date: timestamp("date").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  url: text("url").notNull(),
  thumbnail: text("thumbnail"),
  category: text("category").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  teamId: integer("team_id"),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  week: integer("week").notNull(),
  day: integer("day").notNull(),
  contentFields: jsonb("content_fields").notNull().default([]),
  isComplete: boolean("is_complete").default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workoutVideos = pgTable("workout_videos", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull(),
  url: text("url").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reactions = pgTable("reactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  postId: integer("post_id").notNull(),
  type: text("type", {
    enum: ["like", "heart", "smile", "celebrate", "support"]
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPostSchema = createInsertSchema(posts)
  .omit({
    id: true,
    createdAt: true,
    userId: true
  })
  .extend({
    content: z.string().nullable(),
    imageUrl: z.string().nullable(),
    type: z.enum(["food", "workout", "scripture", "memory_verse", "comment"]),
    points: z.number().default(1),
    parentId: z.number().optional().nullable(),
    depth: z.number().default(0)
  });

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
});


export const insertMeasurementSchema = createInsertSchema(measurements);
export const insertNotificationSchema = createInsertSchema(notifications);
export const insertVideoSchema = createInsertSchema(videos);
export const insertActivitySchema = createInsertSchema(activities)
  .extend({
    contentFields: z.array(
      z.object({
        id: z.string(),
        type: z.enum(['text', 'video']),
        content: z.string(),
        title: z.string()
      })
    )
  });

export const insertWorkoutVideoSchema = createInsertSchema(workoutVideos);

export const insertReactionSchema = createInsertSchema(reactions)
  .omit({
    id: true,
    createdAt: true
  });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type Post = typeof posts.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Activity = typeof activities.$inferSelect & {
  contentFields: Array<{
    id: string;
    type: 'text' | 'video';
    content: string;
    title: string;
  }>;
};

export type WorkoutVideo = typeof workoutVideos.$inferSelect;
export type InsertWorkoutVideo = z.infer<typeof insertWorkoutVideoSchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
export type InsertReaction = z.infer<typeof insertReactionSchema>;

// Add a new type for structured comments
export type CommentWithAuthor = Post & {
  author: {
    id: number;
    username: string;
    imageUrl?: string;
  };
  replies?: CommentWithAuthor[];
};