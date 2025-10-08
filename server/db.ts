import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000, // 5 seconds (faster for deployment)
  max: 2, // Minimal connections for startup
  idleTimeoutMillis: 60000, // 1 minute (faster cleanup)
  statement_timeout: 15000, // 15 seconds (faster failure)
  query_timeout: 15000, // 15 seconds (faster failure)
  keepAlive: true,
  keepAliveInitialDelayMillis: 500, // Faster initial delay
  application_name: 'app',
  ssl: { rejectUnauthorized: false },
  maxUses: 100, // Lower limit to prevent resource issues
  allowExitOnIdle: true // Allow connections to close when idle for deployment
};

// Create pool with error handling
export const pool = new Pool(poolConfig);

// Setup more robust error handling
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Try to recover by creating a new Pool instance if we encounter a fatal error
  if (err.message.includes('FATAL')) {
    console.warn('Fatal database error detected, attempting to reconnect...');
    setTimeout(() => {
      try {
        // Create a fresh connection
        const newPool = new Pool(poolConfig);
        // Export it (this won't affect existing references)
        console.log('Successfully created new connection pool');
      } catch (reconnectError) {
        console.error('Failed to reconnect to database:', reconnectError);
      }
    }, 2000); // Wait 2 seconds before attempting to reconnect (faster for deployment)
  }
});

// Setup connection validation (reduced logging for stability)
pool.on('connect', (client) => {
  // Only log initial pool establishment, not every connection
  // console.log('Database client connected');
  client.on('error', (err) => {
    console.error('Database client error:', err);
  });
});

// Create Drizzle ORM instance
export const db = drizzle({ client: pool, schema });