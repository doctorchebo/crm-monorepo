import dotenv from "dotenv";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { Sql } from "postgres";
import * as schema from "./schema";

dotenv.config();

// Use global to persist the connection across HMR (Hot Module Replacement) in development
// This prevents creating new connections on every module reload in Next.js
declare global {
  // eslint-disable-next-line no-var
  var __postgres_client__: Sql | undefined;
  // eslint-disable-next-line no-var
  var __db_instance__: PostgresJsDatabase<typeof schema> | undefined;
}

function getPostgresUrl(): string {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL environment variable is not set");
  }
  return process.env.POSTGRES_URL;
}

function createClient(): Sql {
  // In development, reuse the global client to prevent connection exhaustion during HMR
  if (process.env.NODE_ENV === "development" && global.__postgres_client__) {
    return global.__postgres_client__;
  }

  const client = postgres(getPostgresUrl(), {
    // Connection pool configuration
    max: 10, // Maximum connections in pool
    idle_timeout: 30, // Close idle connections after 30 seconds
    connect_timeout: 10, // Connection timeout in seconds
    prepare: false, // Disable prepared statements for Next.js serverless compatibility
  });

  // Store in global for HMR persistence in development
  if (process.env.NODE_ENV === "development") {
    global.__postgres_client__ = client;
  }

  return client;
}

function initializeDb(): PostgresJsDatabase<typeof schema> {
  // Check if we already have a global instance (survives HMR in development)
  if (process.env.NODE_ENV === "development" && global.__db_instance__) {
    return global.__db_instance__;
  }

  const client = createClient();
  const instance = drizzle(client, { schema });

  // Store in global for HMR persistence in development
  if (process.env.NODE_ENV === "development") {
    global.__db_instance__ = instance;
    console.log(
      "[Frontend DB] Database connection initialized (development mode with HMR support)"
    );
  }

  return instance;
}

export const client = createClient();
export const db = initializeDb();

/**
 * Gracefully close the database connection
 * Call this during application shutdown if needed
 */
export async function closeDbConnection(): Promise<void> {
  if (global.__postgres_client__) {
    await global.__postgres_client__.end();
    global.__postgres_client__ = undefined;
    global.__db_instance__ = undefined;
    console.log("[Frontend DB] Connection closed");
  }
}
