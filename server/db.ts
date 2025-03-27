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
  connectionTimeoutMillis: 30000, // 30 seconds
  max: 5, // Increase max connections
  idleTimeoutMillis: 30000, // 30 seconds
  statement_timeout: 60000, // 1 minute
  query_timeout: 60000, // 1 minute
  keepAlive: true,
  keepAliveInitialDelayMillis: 1000,
  application_name: 'app',
  ssl: {
    rejectUnauthorized: false
  }
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const db = drizzle({ client: pool, schema });