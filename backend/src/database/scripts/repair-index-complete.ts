/**
 * Script: Complete the index repair
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db.connection';

async function repairIndex() {
  console.log('🔧 Completing index repair...\n');

  try {
    // Rebuild all indexes on the messages table
    console.log('📊 Running REINDEX on entire messages table...');
    await db.execute(sql`REINDEX TABLE messages`);
    console.log('✅ All messages table indexes rebuilt!\n');

    // Run VACUUM ANALYZE to update statistics
    console.log('📊 Running VACUUM ANALYZE on messages table...');
    await db.execute(sql`VACUUM ANALYZE messages`);
    console.log('✅ VACUUM ANALYZE complete!\n');

    console.log(
      '🎉 Index repair complete! The database should now work correctly.',
    );
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

repairIndex();
