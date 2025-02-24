import { db } from "../db";
import { sql } from "drizzle-orm";
import { hashPassword } from "../auth";

export async function runMigrations() {
  try {
    // Drop and recreate users table to ensure correct schema
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
      ON CONFLICT (username) DO UPDATE
      SET password = ${hashedPassword}
    `);

    // Create notifications table if it doesn't exist
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

    // Drop and recreate posts table with parent_id
    await db.execute(sql`
      DROP TABLE IF EXISTS posts;
      CREATE TABLE posts (
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

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}