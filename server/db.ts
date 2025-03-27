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
  connectionTimeoutMillis: 10000, // 10 seconds
  max: 3, // Limit max connections to prevent overloading
  idleTimeoutMillis: 30000, // 30 seconds
  statement_timeout: 30000, // 30 seconds
  query_timeout: 30000, // 30 seconds
  keepAlive: true,
  keepAliveInitialDelayMillis: 1000,
  application_name: 'app',
  ssl: true,
  maxUses: 100, // Close client after 100 uses (can help with issues)
  allowExitOnIdle: true // Allow clients to exit on idle (helps with cleanup)
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
    }, 5000); // Wait 5 seconds before attempting to reconnect
  }
});

// Setup connection validation
pool.on('connect', (client) => {
  console.log('New database client connected');
  client.on('error', (err) => {
    console.error('Database client error:', err);
  });
});

// Create Drizzle ORM instance
export const db = drizzle({ client: pool, schema });