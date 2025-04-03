import { db } from "../db";
import { sql } from "drizzle-orm";
import { hashPassword } from "../auth";

export async function runMigrations() {
  try {
    console.log('Running migrations...');

    // Create users table with all required columns
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        preferred_name TEXT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        is_team_lead BOOLEAN DEFAULT false,
        team_id INTEGER,
        points INTEGER DEFAULT 0,
        weight INTEGER,
        waist INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        image_url TEXT,
        team_joined_at TIMESTAMP WITH TIME ZONE,
        current_week INTEGER DEFAULT 1,
        current_day INTEGER DEFAULT 1
      )
    `);

    // Insert default admin if not exists with properly hashed password
    const hashedPassword = await hashPassword('admin123');
    await db.execute(sql`
      INSERT INTO users (username, email, password, is_admin)
      VALUES ('admin', 'admin@example.com', ${hashedPassword}, true)
      ON CONFLICT DO NOTHING
    `);

    // Create other tables as needed
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        content TEXT,
        image_url TEXT,
        points INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        parent_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        depth INTEGER DEFAULT 0
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        week INTEGER NOT NULL,
        day INTEGER NOT NULL,
        content_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_complete BOOLEAN DEFAULT false,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS measurements (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        weight INTEGER,
        waist INTEGER,
        date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS reactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, post_id, type)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        recipient_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT,
        image_url TEXT,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add achievement_notifications_enabled column to users table
    try {
      await db.execute(sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS achievement_notifications_enabled BOOLEAN DEFAULT false
      `);
      console.log('Added achievement_notifications_enabled column to users table');
    } catch (columnError) {
      console.error('Error adding achievement_notifications_enabled column:', columnError);
    }

    // Add notification_time column to users table if it doesn't exist yet
    try {
      await db.execute(sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS notification_time TEXT
      `);
      console.log('Added notification_time column to users table');
    } catch (columnError) {
      console.error('Error adding notification_time column:', columnError);
    }

    // Add achievement_types table if it doesn't exist
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS achievement_types (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          icon_path TEXT,
          point_value INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Created achievement_types table if not exists');
    } catch (tableError) {
      console.error('Error creating achievement_types table:', tableError);
    }

    // Add user_achievements table if it doesn't exist
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS user_achievements (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          achievement_type_id INTEGER NOT NULL REFERENCES achievement_types(id) ON DELETE CASCADE,
          earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          viewed BOOLEAN DEFAULT false,
          UNIQUE(user_id, achievement_type_id)
        )
      `);
      console.log('Created user_achievements table if not exists');
    } catch (tableError) {
      console.error('Error creating user_achievements table:', tableError);
    }

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}