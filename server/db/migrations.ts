
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  try {
    // First drop the existing table if it exists
    await db.execute(sql`DROP TABLE IF EXISTS notifications`);
    
    // Then create the notifications table with proper schema
    await db.execute(sql`
      CREATE TABLE notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  try {
    // Add image_url column to users table if it doesn't exist
    await db.execute(sql`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name='users' AND column_name='image_url'
        ) THEN 
          ALTER TABLE users ADD COLUMN image_url TEXT;
        END IF;
      END $$;
    `);
    
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}
