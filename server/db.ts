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
  connectionTimeoutMillis: 10000,
  max: 10,
  idleTimeoutMillis: 60000,
  retryInterval: 2000,
  maxRetries: 5,
  ssl: {
    rejectUnauthorized: false
  }
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Configure neon
neonConfig.fetchConnectionCache = true;
neonConfig.useSecureWebSocket = false;

// Create connection with error handling
const sql = neon(process.env.DATABASE_URL!);
sql.on('error', (err) => {
  console.error('Database connection error:', err);
});

export const db = drizzle(sql, { schema });