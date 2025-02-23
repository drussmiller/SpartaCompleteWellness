
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  try {
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

    // Add image_url column to users table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS image_url TEXT
    `);

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}
