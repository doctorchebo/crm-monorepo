import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db.connection';

async function check() {
  const r = await db.execute(
    sql`SELECT direction, COUNT(*) as cnt FROM messages GROUP BY direction`,
  );
  console.log('Results:', JSON.stringify(r, null, 2));
  process.exit(0);
}

check();
