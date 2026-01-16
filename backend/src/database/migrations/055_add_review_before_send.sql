-- Migration: Add review_before_send column to chat_ai_overrides
-- Description: Adds the ability for users to review AI-generated responses before they are sent
-- Author: Antigravity

-- Add review_before_send column
ALTER TABLE "chat_ai_overrides"
ADD COLUMN IF NOT EXISTS "review_before_send" boolean DEFAULT false;

-- Add comment
COMMENT ON COLUMN "chat_ai_overrides"."review_before_send" IS 'When enabled, AI responses are shown to the user for review/editing before being sent to the customer';

-- Down Migration (Commented out)
-- ALTER TABLE "chat_ai_overrides" DROP COLUMN IF EXISTS "review_before_send";
