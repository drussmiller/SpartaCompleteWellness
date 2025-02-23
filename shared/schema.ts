import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Keep existing tables
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false),
  teamId: integer("team_id"),
  points: integer("points").default(0),
  weight: integer("weight"),
  waist: integer("waist"),
  createdAt: timestamp("created_at").defaultNow(),
  imageUrl: text("image_url"),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type", { enum: ["food", "workout", "scripture", "memory_verse", "comment"] }).notNull(),
  content: text("content"),
  imageUrl: text("image_url"),
  points: integer("points").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
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

// Add new videos table
export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  url: text("url").notNull(),
  thumbnail: text("thumbnail"),
  category: text("category").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  teamId: integer("team_id"), // Optional team ID to filter videos by team
});

// Keep existing schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTeamSchema = createInsertSchema(teams);
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
    points: z.number().default(1)
  });

export const insertMeasurementSchema = createInsertSchema(measurements)
  .omit({ 
    id: true,
    date: true 
  })
  .extend({
    weight: z.number().min(50, "Weight must be at least 50 lbs").max(500, "Weight must be less than 500 lbs"),
    waist: z.number().min(20, "Waist must be at least 20 inches").max(100, "Waist must be less than 100 inches")
  });

export const insertNotificationSchema = createInsertSchema(notifications);

// Add new video schema
export const insertVideoSchema = createInsertSchema(videos)
  .omit({ 
    id: true,
    createdAt: true
  })
  .extend({
    thumbnail: z.string().nullable(),
  });

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;