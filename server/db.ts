import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

class JsonSafeWebSocket extends ws {
  constructor(...args: ConstructorParameters<typeof ws>) {
    super(...args);
    this.addEventListener('error', () => {});
  }
}
neonConfig.webSocketConstructor = JsonSafeWebSocket as any;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  max: 10,
  idleTimeoutMillis: 10000,
  statement_timeout: 15000,
  query_timeout: 15000,
  application_name: 'app',
  ssl: true,
  maxUses: 50,
  allowExitOnIdle: false
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.warn('[db pool] idle client error (will be auto-removed):', err.message);
});

// Create Drizzle ORM instance
export const db = drizzle({ client: pool, schema });