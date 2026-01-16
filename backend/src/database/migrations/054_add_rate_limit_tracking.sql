-- Migration: Add rate_limit_tracking table
-- Description: Tracks message counts per user/chat to enforce rate limits
-- Author: Antigravity

-- Create rate_limit_tracking table
CREATE TABLE IF NOT EXISTS "rate_limit_tracking" (
  "id" SERIAL PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chat_id" varchar NOT NULL,
  "sender_id" integer,
  
  -- Window definition
  -- 'minute', 'hour', 'day', '24h_session'
  "window_type" varchar(20) NOT NULL,
  "window_start" timestamp NOT NULL,
  "window_end" timestamp NOT NULL,
  
  -- Counters
  "message_count" integer DEFAULT 0 NOT NULL,
  "ai_message_count" integer DEFAULT 0 NOT NULL,
  "template_message_count" integer DEFAULT 0 NOT NULL,
  
  -- Session tracking
  "last_customer_message_at" timestamp,
  
  -- Blocking status
  "is_blocked" boolean DEFAULT false,
  "block_reason" text,
  "blocked_at" timestamp,
  
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),

  -- Unique constraint for one row per window per user/chat
  CONSTRAINT "rate_limit_tracking_unique_window" UNIQUE ("user_id", "chat_id", "window_type", "window_start")
);

-- Separate unique index including sender_id if it's used (partial uniqueness strategy or composite)
-- Drizzle schema definition had: unique().on(table.userId, table.chatId, table.senderId, table.windowType, table.windowStart)
-- But senderId is nullable.
-- PostgreSQL treats NULLs as distinct in UNIQUE constraints unless specified otherwise (Postgres 15+ has NULLS NOT DISTINCT).
-- For safety/simplicity and matching the Drizzle schema which likely intended singular rows:
DROP INDEX IF EXISTS "idx_rate_limit_unique_window";
CREATE UNIQUE INDEX "idx_rate_limit_unique_window" ON "rate_limit_tracking" ("user_id", "chat_id", "window_type", "window_start", COALESCE("sender_id", -1));

-- Performance indexes
CREATE INDEX IF NOT EXISTS "idx_rate_limit_user_id" ON "rate_limit_tracking" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_rate_limit_chat_id" ON "rate_limit_tracking" ("chat_id");
CREATE INDEX IF NOT EXISTS "idx_rate_limit_window_end" ON "rate_limit_tracking" ("window_end");

-- Down Migration (Commented out)
-- DROP TABLE IF EXISTS "rate_limit_tracking";
