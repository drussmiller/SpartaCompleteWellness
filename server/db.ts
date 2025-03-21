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
  connectionTimeoutMillis: 7200000, // 2 hours
  max: 3, // Reduce concurrent connections
  idleTimeoutMillis: 7200000, // 2 hours
  retryInterval: 30000, // More frequent retries
  maxRetries: 240, // More retries with shorter interval
  statement_timeout: 7200000, // 2 hours
  query_timeout: 7200000, // 2 hours
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  application_name: 'app', // Help identify connections
  ssl: {
    rejectUnauthorized: false
  }
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const db = drizzle({ client: pool, schema });