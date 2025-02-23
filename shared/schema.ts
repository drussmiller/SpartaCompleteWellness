import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

// New notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTeamSchema = createInsertSchema(teams);
export const insertPostSchema = createInsertSchema(posts)
  .omit({ 
    id: true,
    createdAt: true 
  })
  .extend({
    content: z.string().nullable(),
    imageUrl: z.string().nullable(),
    points: z.number().default(1)
  });
export const insertMeasurementSchema = createInsertSchema(measurements);
export const insertNotificationSchema = createInsertSchema(notifications);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;