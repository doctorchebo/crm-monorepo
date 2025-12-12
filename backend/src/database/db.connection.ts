import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let dbInstance: any = null;

function initializeDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Make sure .env file exists and contains DATABASE_URL.',
    );
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    // Connection pool configuration
    max: 20, // Maximum number of connections in pool (increased from default 10)
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 2000, // Wait up to 2 seconds for a connection
  });

  // Log pool events for debugging
  pool.on('connect', () => {
    console.log(
      `[DB Pool] Connection established. Total: ${pool.totalCount}, Idle: ${pool.idleCount}`,
    );
  });

  pool.on('error', (err) => {
    console.error('[DB Pool] Error:', err.message);
  });

  // Periodic pool status logging
  setInterval(() => {
    console.log(
      `[DB Pool] Status - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`,
    );
  }, 30000); // Log every 30 seconds

  dbInstance = drizzle(pool, { schema });
  return dbInstance;
}

// Lazy getter wrapper
export const db = new Proxy(
  {},
  {
    get: (target, prop) => {
      const instance = initializeDb();
      return instance[prop as keyof typeof instance];
    },
  },
) as any;
