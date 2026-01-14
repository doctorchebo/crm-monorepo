/**
 * Database connection module for Lambda functions
 * Uses pg Pool for connection pooling
 */

import { Pool, PoolClient } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error("DATABASE_URL environment variable is required");
        }

        pool = new Pool({
            connectionString,
            max: 5, // Keep pool small for Lambda
            idleTimeoutMillis: 60000,
            connectionTimeoutMillis: 10000,
            ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
        });
    }
    return pool;
}

export async function withClient<T>(
    fn: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await getPool().connect();
    try {
        return await fn(client);
    } finally {
        client.release();
    }
}

export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
