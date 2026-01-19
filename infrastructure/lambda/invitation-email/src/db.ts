/**
 * Database connection for Invitation Email Lambda
 */

import { Pool, PoolClient } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1, // Lambda only needs 1 connection
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export { pool };
