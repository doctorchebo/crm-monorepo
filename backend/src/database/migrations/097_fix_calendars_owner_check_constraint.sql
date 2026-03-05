-- Migration: Fix calendars owner check constraint
-- Description: The original constraint required EITHER team_id OR user_id exclusively,
-- but calendars are team-scoped and user-owned, so both fields should be allowed.
-- The new constraint only requires at least one to be set.

ALTER TABLE calendars
  DROP CONSTRAINT IF EXISTS calendars_owner_check;

ALTER TABLE calendars
  ADD CONSTRAINT calendars_owner_check CHECK (
    team_id IS NOT NULL OR user_id IS NOT NULL
  );
