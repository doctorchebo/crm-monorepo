import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Use global to persist the pool across HMR (Hot Module Replacement) in development
// This prevents creating new pools on every module reload
declare global {
  // eslint-disable-next-line no-var
  var __db_pool__: Pool | undefined;
  // eslint-disable-next-line no-var
  var __db_instance__: NodePgDatabase<typeof schema> | undefined;
  // eslint-disable-next-line no-var
  var __db_pool_interval__: NodeJS.Timeout | undefined;
}

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Make sure .env file exists and contains DATABASE_URL.',
    );
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    // Connection pool configuration - optimized for stability
    max: 10, // Reduced from 20 to prevent connection exhaustion
    min: 2, // Keep minimum connections ready
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 5000, // Wait up to 5 seconds for a connection (increased for stability)
    allowExitOnIdle: false, // Keep pool alive
  });

  // Log pool events for debugging
  pool.on('connect', () => {
    console.log(
      `[DB Pool] Connection established. Total: ${pool.totalCount}, Idle: ${pool.idleCount}`,
    );
  });

  pool.on('error', (err) => {
    console.error('[DB Pool] Pool error:', err.message);
    // Don't crash on idle client errors
    if (err.message.includes('Connection terminated unexpectedly')) {
      console.warn('[DB Pool] Connection lost, pool will reconnect...');
    }
  });

  pool.on('remove', () => {
    console.log(
      `[DB Pool] Connection removed. Total: ${pool.totalCount}, Idle: ${pool.idleCount}`,
    );
  });

  return pool;
}

function initializeDb(): NodePgDatabase<typeof schema> {
  // Check if we already have a global instance (survives HMR)
  if (global.__db_instance__ && global.__db_pool__) {
    return global.__db_instance__;
  }

  // Close any existing pool before creating a new one
  if (global.__db_pool__) {
    console.log('[DB Pool] Closing existing pool before creating new one...');
    global.__db_pool__.end().catch((err) => {
      console.error('[DB Pool] Error closing old pool:', err);
    });
  }

  // Clear any existing interval
  if (global.__db_pool_interval__) {
    clearInterval(global.__db_pool_interval__);
    global.__db_pool_interval__ = undefined;
  }

  const pool = createPool();
  const instance = drizzle(pool, { schema });

  // Store in global for HMR persistence
  global.__db_pool__ = pool;
  global.__db_instance__ = instance;

  // Periodic pool status logging (only one interval)
  global.__db_pool_interval__ = setInterval(() => {
    if (global.__db_pool__) {
      console.log(
        `[DB Pool] Status - Total: ${global.__db_pool__.totalCount}, Idle: ${global.__db_pool__.idleCount}, Waiting: ${global.__db_pool__.waitingCount}`,
      );
    }
  }, 60000); // Log every 60 seconds (reduced frequency)

  console.log('[DB Pool] Database connection initialized');
  return instance;
}

// Lazy getter wrapper with global singleton
export const db = new Proxy(
  {},
  {
    get: (_target, prop) => {
      const instance = initializeDb();
      return instance[prop as keyof typeof instance];
    },
  },
) as NodePgDatabase<typeof schema>;

/**
 * Gracefully close the database pool
 * Call this during application shutdown
 */
export async function closeDbPool(): Promise<void> {
  if (global.__db_pool_interval__) {
    clearInterval(global.__db_pool_interval__);
    global.__db_pool_interval__ = undefined;
  }

  if (global.__db_pool__) {
    console.log('[DB Pool] Closing database pool...');
    await global.__db_pool__.end();
    global.__db_pool__ = undefined;
    global.__db_instance__ = undefined;
    console.log('[DB Pool] Database pool closed');
  }
}

/**
 * Get pool statistics for monitoring
 */
export function getPoolStats(): {
  total: number;
  idle: number;
  waiting: number;
} | null {
  if (!global.__db_pool__) return null;
  return {
    total: global.__db_pool__.totalCount,
    idle: global.__db_pool__.idleCount,
    waiting: global.__db_pool__.waitingCount,
  };
}
