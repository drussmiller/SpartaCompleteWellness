import { db } from "../db";
import { sql } from "drizzle-orm";
import { hashPassword } from "../auth";

export async function runMigrations() {
  try {
    console.log('Running migrations...');

    // Create users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        preferred_name TEXT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        team_id INTEGER,
        points INTEGER DEFAULT 0,
        weight INTEGER,
        waist INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        image_url TEXT
      )
    `);

    // Insert default admin if not exists with properly hashed password
    const hashedPassword = await hashPassword('admin123');
    await db.execute(sql`
      INSERT INTO users (username, email, password, is_admin)
      VALUES ('admin', 'admin@example.com', ${hashedPassword}, true)
      ON CONFLICT DO NOTHING
    `);

    // Create teams table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT
      )
    `);

    // Create posts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        content TEXT,
        image_url TEXT,
        points INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        parent_id INTEGER REFERENCES posts(id) ON DELETE CASCADE
      )
    `);

    // Create measurements table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS measurements (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        weight INTEGER,
        waist INTEGER,
        date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create notifications table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create activities table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        week INTEGER NOT NULL,
        day INTEGER NOT NULL,
        memory_verse TEXT NOT NULL,
        memory_verse_reference TEXT NOT NULL,
        scripture TEXT,
        workout TEXT,
        tasks TEXT,
        description TEXT,
        is_complete BOOLEAN DEFAULT false,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create workout_videos table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS workout_videos (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create videos table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        url TEXT NOT NULL,
        thumbnail TEXT,
        category TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        team_id INTEGER
      )
    `);

    // Add depth column to posts table
    await db.execute(sql`
      ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0
    `);

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}