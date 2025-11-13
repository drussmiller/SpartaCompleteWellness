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
  isGroupAdmin: boolean("is_group_admin").default(false),
  teamId: integer("team_id"), // Users belong to teams
  adminGroupId: integer("admin_group_id"), // Group they are admin of (if isGroupAdmin is true)
  points: integer("points").default(0),
  weight: integer("weight"),
  waist: integer("waist"),
  createdAt: timestamp("created_at").defaultNow(),
  imageUrl: text("image_url"),
  teamJoinedAt: timestamp("team_joined_at"), // When user joined their team
  programStartDate: timestamp("program_start_date"), // First Monday on or after team join date
  currentWeek: integer("current_week").default(1),
  currentDay: integer("current_day").default(1),
  notificationTime: text("notification_time").default("09:00"), // Adding notification time preference
  timezoneOffset: integer("timezone_offset"), // Timezone offset in minutes (e.g., -300 for Central Time)
  dailyNotificationsEnabled: boolean("daily_notifications_enabled").default(true), // Whether daily reminder notifications are enabled
  achievementNotificationsEnabled: boolean("achievement_notifications_enabled").default(false),
  confirmationMessagesEnabled: boolean("confirmation_messages_enabled").default(true), // Whether to show confirmation/success messages (toasts)
  phoneNumber: text("phone_number"), // Phone number for SMS notifications
  smsEnabled: boolean("sms_enabled").default(false), // Whether SMS notifications are enabled
  lastPrayerRequestView: timestamp("last_prayer_request_view"), // Track when user last viewed prayer requests
  waiverSigned: boolean("waiver_signed").default(false),
  waiverSignedAt: timestamp("waiver_signed_at"),
  waiverSignature: text("waiver_signature"),
  preferredActivityTypeId: integer("preferred_activity_type_id").default(1), // Default to "Bands" workout type
  status: integer("status").default(1), // 1 = active, 0 = inactive
  avatarColor: text("avatar_color"), // Color for avatar fallback background
});

// Organizations table (top level)
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: integer("status").default(1), // 1 = active, 0 = inactive
  createdAt: timestamp("created_at").defaultNow(),
});

// Groups table (belongs to Organization)
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  organizationId: integer("organization_id").notNull(),
  status: integer("status").default(1), // 1 = active, 0 = inactive
  competitive: boolean("competitive").default(false), // Whether this group is competitive
  groupAdminInviteCode: text("group_admin_invite_code").unique(),
  programStartDate: timestamp("program_start_date"), // Program start date for the group
  createdAt: timestamp("created_at").defaultNow(),
});

// Teams table (belongs to Group)
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  groupId: integer("group_id").notNull(),
  maxSize: integer("max_size").default(6), // Maximum number of people allowed in the team
  status: integer("status").default(1), // 1 = active, 0 = inactive
  teamAdminInviteCode: text("team_admin_invite_code").unique(),
  teamMemberInviteCode: text("team_member_invite_code").unique(),
  programStartDate: timestamp("program_start_date"), // Program start date for the team
  createdAt: timestamp("created_at").defaultNow(),
});

// Create insert schemas for organizations, groups, and teams
export const insertOrganizationSchema = createInsertSchema(organizations).extend({
  name: z.string().min(1, "Organization name is required"),
  description: z.string().optional(),
  status: z.number().min(0).max(1).default(1),
});

export const insertGroupSchema = createInsertSchema(groups).extend({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
  organizationId: z.number().min(1, "Organization ID is required"),
  status: z.number().min(0).max(1).default(1),
  competitive: z.boolean().default(false),
  programStartDate: z.date().optional(),
});

export const insertTeamSchema = createInsertSchema(teams).extend({
  name: z.string().min(1, "Team name is required"),
  description: z.string().optional(),
  groupId: z.number().min(1, "Group ID is required"),
  maxSize: z.number().min(1, "Team max size must be at least 1").default(6),
  status: z.number().min(0).max(1).default(1),
  programStartDate: z.date().optional(),
});

// Invite Codes table for QR code invites
export const inviteCodes = pgTable("invite_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type", { enum: ["group_admin", "team_admin", "team_member"] }).notNull(),
  groupId: integer("group_id"),
  teamId: integer("team_id"),
  createdBy: integer("created_by").notNull(),
  expiresAt: timestamp("expires_at"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInviteCodeSchema = createInsertSchema(inviteCodes)
  .omit({
    id: true,
    createdAt: true,
    usedCount: true,
  })
  .extend({
    code: z.string().min(6, "Invite code must be at least 6 characters"),
    type: z.enum(["group_admin", "team_admin", "team_member"]),
    groupId: z.number().optional(),
    teamId: z.number().optional(),
    createdBy: z.number(),
    expiresAt: z.date().optional(),
    maxUses: z.number().optional(),
    isActive: z.boolean().default(true),
  });

// Types
export type Organization = typeof organizations.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type InsertInviteCode = z.infer<typeof insertInviteCodeSchema>;

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type", { enum: ["food", "workout", "scripture", "memory_verse", "comment", "miscellaneous", "prayer", "introductory_video"] }).notNull(),
  content: text("content"),
  mediaUrl: text("image_url"), // Using the existing image_url column for both images and videos
  is_video: boolean("is_video").default(false), // Flag to explicitly mark video content
  points: integer("points").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  parentId: integer("parent_id"),
  depth: integer("depth").default(0),
  postScope: text("post_scope", { enum: ["everyone", "organization", "group", "team", "my_team"] }).default("my_team"), // Scope of the post
  targetOrganizationId: integer("target_organization_id"), // When postScope is "organization"
  targetGroupId: integer("target_group_id"), // When postScope is "group"
  targetTeamId: integer("target_team_id"), // When postScope is "team"
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
  teamId: integer("team_id"), // Videos belong to teams
});

// Workout types table
export const workoutTypes = pgTable("workout_types", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  week: integer("week").notNull(),
  day: integer("day").notNull(),
  contentFields: jsonb("content_fields").notNull().default([]),
  isComplete: boolean("is_complete").default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  activityTypeId: integer("activity_type_id").default(1), // Default to "Bands" workout type
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
  posterUrl: text("poster_url"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  is_video: boolean("is_video").default(false),
});

// Relations for hierarchy
export const organizationRelations = relations(organizations, ({ many }) => ({
  groups: many(groups),
}));

export const groupRelations = relations(groups, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [groups.organizationId],
    references: [organizations.id],
  }),
  teams: many(teams),
}));

export const teamRelations = relations(teams, ({ one, many }) => ({
  group: one(groups, {
    fields: [teams.groupId],
    references: [groups.id],
  }),
  users: many(users),
}));

export const userRelations = relations(users, ({ one }) => ({
  team: one(teams, {
    fields: [users.teamId],
    references: [teams.id],
  }),
  adminGroup: one(groups, {
    fields: [users.adminGroupId],
    references: [groups.id],
  }),
}));

// Add relations for activities and workout types
export const workoutTypeRelations = relations(workoutTypes, ({ many }) => ({
  activities: many(activities),
}));

export const activityRelations = relations(activities, ({ one }) => ({
  workoutType: one(workoutTypes, {
    fields: [activities.activityTypeId],
    references: [workoutTypes.id],
  }),
}));

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
    is_video: z.boolean().optional().default(false),
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
    is_video: z.boolean().optional().default(false), // Flag for explicitly marking video content
    postScope: z.enum(["everyone", "organization", "group", "team", "my_team"]).default("my_team"),
    targetOrganizationId: z.number().optional().nullable(),
    targetGroupId: z.number().optional().nullable(),
    targetTeamId: z.number().optional().nullable(),
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
    password: z.string().min(6, "Password must be at least 6 characters"),
    waiverSigned: z.boolean().default(false),
    waiverSignature: z.string().optional(),
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
export const insertWorkoutTypeSchema = createInsertSchema(workoutTypes)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    type: z.string().min(1, "Workout type is required"),
  });

export const insertActivitySchema = createInsertSchema(activities)
  .extend({
    contentFields: z.array(
      z.object({
        id: z.string(),
        type: z.enum(['text', 'video']),
        content: z.string(),
        title: z.string()
      })
    ).default([]),
    activityTypeId: z.number().default(1),
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
export type WorkoutType = typeof workoutTypes.$inferSelect;
export type InsertWorkoutType = z.infer<typeof insertWorkoutTypeSchema>;
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

// System state table to track notification scheduler state
export const systemState = pgTable("system_state", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SystemState = typeof systemState.$inferSelect;