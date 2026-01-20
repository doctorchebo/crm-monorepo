/**
 * Database utilities for password reset Lambda
 */

import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function withClient<T>(
  fn: (client: Pool) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  return fn(pool);
}
