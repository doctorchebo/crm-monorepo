/**
 * Script: Repair corrupted PostgreSQL index
 *
 * Run with: npx tsx src/database/scripts/repair-index.ts
 *
 * This script rebuilds corrupted indexes on the messages table.
 * The error "table tid from new index tuple overlaps with invalid duplicate tuple"
 * indicates index corruption that needs to be repaired with REINDEX.
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db.connection';

async function repairIndex() {
  console.log('🔧 Repairing corrupted PostgreSQL indexes...\n');

  try {
    // Rebuild the specific corrupted index
    console.log('📊 Rebuilding idx_messages_sender...');
    await db.execute(sql`REINDEX INDEX idx_messages_sender`);
    console.log('✅ idx_messages_sender rebuilt successfully!\n');

    // Also rebuild other message indexes for safety
    console.log('📊 Rebuilding messages_message_id_unique...');
    await db.execute(sql`REINDEX INDEX messages_message_id_unique`);
    console.log('✅ messages_message_id_unique rebuilt successfully!\n');

    console.log('📊 Rebuilding idx_messages_is_deleted...');
    await db.execute(sql`REINDEX INDEX idx_messages_is_deleted`);
    console.log('✅ idx_messages_is_deleted rebuilt successfully!\n');

    console.log('📊 Rebuilding idx_messages_reply_to_message_id...');
    await db.execute(sql`REINDEX INDEX idx_messages_reply_to_message_id`);
    console.log('✅ idx_messages_reply_to_message_id rebuilt successfully!\n');

    console.log('📊 Rebuilding idx_messages_is_ai_generated...');
    await db.execute(sql`REINDEX INDEX idx_messages_is_ai_generated`);
    console.log('✅ idx_messages_is_ai_generated rebuilt successfully!\n');

    // Optionally rebuild all indexes on the messages table
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
    console.error('❌ Error repairing index:', error);
    process.exit(1);
  }

  process.exit(0);
}

repairIndex();
