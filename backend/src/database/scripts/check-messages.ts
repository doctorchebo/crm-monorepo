/**
 * Quick check of outbound messages
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db.connection';

async function check() {
  console.log('Checking outbound messages...\n');

  const results = await db.execute(sql`
    SELECT 
      direction, 
      type, 
      is_ai_generated, 
      LENGTH(text) as text_len, 
      LEFT(text, 100) as preview
    FROM messages 
    WHERE direction = 'outbound' 
    ORDER BY timestamp DESC 
    LIMIT 10
  `);

  console.log('Recent outbound messages:');
  for (const row of results) {
    console.log(
      `  type=${row.type}, isAiGenerated=${row.is_ai_generated}, len=${row.text_len}`,
    );
    console.log(`    preview: ${row.preview?.substring(0, 80)}...`);
  }

  const counts = await db.execute(sql`
    SELECT 
      type,
      is_ai_generated,
      COUNT(*) as count
    FROM messages 
    WHERE direction = 'outbound' 
    GROUP BY type, is_ai_generated
  `);

  console.log('\nMessage counts by type and is_ai_generated:');
  for (const row of counts) {
    console.log(
      `  type=${row.type}, isAiGenerated=${row.is_ai_generated}: ${row.count}`,
    );
  }

  process.exit(0);
}

check();
