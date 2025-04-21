import { pgTable, text, serial, integer, timestamp, boolean, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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
  notificationTime: text("notification_time").default("09:00"), // Adding notification time preference
  achievementNotificationsEnabled: boolean("achievement_notifications_enabled").default(false),
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
  type: text("type", { enum: ["food", "workout", "scripture", "memory_verse", "comment", "miscellaneous", "prayer"] }).notNull(),
  content: text("content"),
  mediaUrl: text("image_url"), // Using the existing image_url column for both images and videos
  is_video: boolean("is_video").default(false), // Flag to explicitly mark video content
  points: integer("points").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  parentId: integer("parent_id"),
  depth: integer("depth").default(0),
});

// Relationship for post replies/comments
export const postRelations = relations(posts, ({ one, many }) => ({
  parent: one(posts, {
    fields: [posts.parentId],
    references: [posts.id],
  }),
  replies: many(posts),
  author: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
}));

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
  type: text("type").default("general"),
  sound: text("sound"),
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

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  recipientId: integer("recipient_id").notNull(),
  content: text("content"),
  imageUrl: text("image_url"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Add relations for messages
export const messageRelations = relations(messages, ({ one }) => ({
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  recipient: one(users, {
    fields: [messages.recipientId],
    references: [users.id],
  }),
}));

// Create insert schema for messages
export const insertMessageSchema = createInsertSchema(messages)
  .omit({
    id: true,
    createdAt: true,
    isRead: true,
  })
  .extend({
    content: z.string().optional(),
    imageUrl: z.string().optional(),
  });

// Add types
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;


// Update the post schema with proper validation
export const insertPostSchema = createInsertSchema(posts)
  .omit({
    id: true,
    createdAt: true,
    userId: true
  })
  .extend({
    content: z.string().nullable(),
    mediaUrl: z.string().nullable(), // Updated from imageUrl to mediaUrl
    type: z.enum(["food", "workout", "scripture", "memory_verse", "comment", "miscellaneous", "prayer"]),
    points: z.number().default(1),
    parentId: z.number().optional().nullable(),
    depth: z.number().default(0),
    createdAt: z.string().optional(),
    is_video: z.boolean().optional().default(false) // Flag for explicitly marking video content
  });

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    email: true,
    password: true,
  })
  .extend({
    username: z.string().min(1, "Username is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters")
  });

export const insertMeasurementSchema = createInsertSchema(measurements);
export const insertNotificationSchema = createInsertSchema(notifications)
  .extend({
    title: z.string().min(1, "Notification title is required"),
    message: z.string().min(1, "Notification message is required"),
    read: z.boolean().default(false),
    createdAt: z.date().optional().default(() => new Date()),
    type: z.string().default("general"),
    sound: z.string().optional()
  });
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
    ).default([])
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

// Achievement tables
export const achievementTypes = pgTable("achievement_types", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().unique(), // food-streak, workout-streak, etc.
  name: text("name").notNull(),
  description: text("description").notNull(),
  iconPath: text("icon_path").notNull(),
  pointValue: integer("point_value").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  achievementTypeId: integer("achievement_type_id").notNull(),
  earnedAt: timestamp("earned_at").defaultNow(),
  viewed: boolean("viewed").default(false),
});

// Relations for achievements
export const userAchievementRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, {
    fields: [userAchievements.userId],
    references: [users.id],
  }),
  achievementType: one(achievementTypes, {
    fields: [userAchievements.achievementTypeId],
    references: [achievementTypes.id],
  }),
}));

// Types for achievements
export type AchievementType = typeof achievementTypes.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;

// Insert schemas for achievements
export const insertAchievementTypeSchema = createInsertSchema(achievementTypes)
  .omit({
    id: true,
    createdAt: true,
  });

export const insertUserAchievementSchema = createInsertSchema(userAchievements)
  .omit({
    id: true,
    earnedAt: true,
  });

export type InsertAchievementType = z.infer<typeof insertAchievementTypeSchema>;
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;