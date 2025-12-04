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
  });

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
