/**
 * Migration: Add invitation email delivery tracking and rate limits
 *
 * Adds:
 * - email_sent_at: When email was successfully sent
 * - delivery_status: PENDING, SENT, FAILED
 * - token_hash: Hashed token for security (optional future use)
 * - invitation_rate_limits table: Rate limit tracking per user/team
 */

import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export async function up(db: PostgresJsDatabase) {
  // Add new columns to invitations table
  await db.execute(sql`
    ALTER TABLE invitations 
    ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS token_hash VARCHAR(255);
  `);

  // Add index for delivery status queries
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_invitations_delivery_status 
    ON invitations(delivery_status);
  `);

  // Create rate limit tracking table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS invitation_rate_limits (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      period_type VARCHAR(20) NOT NULL, -- 'hourly' or 'daily'
      period_start TIMESTAMP NOT NULL,
      count INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Add unique constraints for rate limit tracking
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_user_period 
    ON invitation_rate_limits(user_id, period_type, period_start)
    WHERE user_id IS NOT NULL;
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_team_period 
    ON invitation_rate_limits(team_id, period_type, period_start)
    WHERE team_id IS NOT NULL;
  `);

  // Add indexes for efficient queries
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id 
    ON invitation_rate_limits(user_id, period_start);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_rate_limits_team_id 
    ON invitation_rate_limits(team_id, period_start);
  `);

  console.log('✅ Added invitation email delivery tracking and rate limits');
}

export async function down(db: PostgresJsDatabase) {
  // Drop rate limits table
  await db.execute(sql`
    DROP TABLE IF EXISTS invitation_rate_limits;
  `);

  // Drop new columns from invitations
  await db.execute(sql`
    ALTER TABLE invitations 
    DROP COLUMN IF EXISTS email_sent_at,
    DROP COLUMN IF EXISTS delivery_status,
    DROP COLUMN IF EXISTS token_hash;
  `);

  // Drop index
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_invitations_delivery_status;
  `);

  console.log('✅ Reverted invitation email delivery tracking and rate limits');
}
