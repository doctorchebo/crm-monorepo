-- Migration: 048_assign_existing_chats_to_default_stage
-- Description: Assigns all existing chats without a stage to the default workflow stage
-- Created: 2026-01-07

-- This migration ensures all chats are visible in the kanban board by assigning them to a stage

DO $$
DECLARE
  default_stage_id UUID;
  user_record RECORD;
  chat_record RECORD;
  stages_created INTEGER := 0;
  chats_assigned INTEGER := 0;
BEGIN
  -- For each user in the system
  FOR user_record IN SELECT id FROM users LOOP
    
    -- Check if user has any workflow stages
    SELECT id INTO default_stage_id
    FROM workflow_stages
    WHERE user_id = user_record.id 
      AND is_default = true 
      AND is_active = true
    LIMIT 1;

    -- If no default stage exists, check if user has any stage
    IF default_stage_id IS NULL THEN
      SELECT id INTO default_stage_id
      FROM workflow_stages
      WHERE user_id = user_record.id 
        AND is_active = true
      ORDER BY sort_order ASC
      LIMIT 1;
    END IF;

    -- If user has no stages at all, create default stages
    IF default_stage_id IS NULL THEN
      -- Create default "New Lead" stage
      INSERT INTO workflow_stages (
        user_id,
        name,
        description,
        color,
        icon,
        sort_order,
        is_default,
        is_final,
        is_active,
        ai_auto_reply,
        ai_handoff_required
      ) VALUES (
        user_record.id,
        'New Lead',
        'Initial contact - unqualified leads',
        '#6366f1',
        'user-plus',
        0,
        true,
        false,
        true,
        true,
        false
      ) RETURNING id INTO default_stage_id;

      stages_created := stages_created + 1;

      -- Create other default stages
      INSERT INTO workflow_stages (user_id, name, description, color, icon, sort_order, is_default, is_final, is_active, ai_auto_reply, ai_handoff_required)
      VALUES 
        (user_record.id, 'Interested', 'Lead has shown interest in products/services', '#8b5cf6', 'star', 1, false, false, true, true, false),
        (user_record.id, 'Negotiating', 'Active negotiation or quote stage', '#f59e0b', 'message-circle', 2, false, false, true, true, true),
        (user_record.id, 'Won', 'Deal closed successfully', '#10b981', 'check-circle', 3, false, true, true, false, false),
        (user_record.id, 'Lost', 'Deal lost or customer not interested', '#ef4444', 'x-circle', 4, false, true, true, false, false);

      RAISE NOTICE 'Created default workflow stages for user %', user_record.id;
    END IF;

    -- Now assign all chats for this user that don't have a stage assignment
    FOR chat_record IN 
      SELECT c.chat_id 
      FROM chats c
      WHERE c.user_id = user_record.id
        AND NOT EXISTS (
          SELECT 1 FROM chat_stage_assignments csa 
          WHERE csa.chat_id = c.chat_id
        )
    LOOP
      -- Insert stage assignment
      INSERT INTO chat_stage_assignments (
        chat_id,
        stage_id,
        awaiting_handoff,
        ai_paused,
        assigned_at,
        updated_at
      ) VALUES (
        chat_record.chat_id,
        default_stage_id,
        false,
        false,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      ) ON CONFLICT (chat_id) DO NOTHING;

      chats_assigned := chats_assigned + 1;

      -- Log the initial stage assignment in history
      INSERT INTO chat_stage_history (
        chat_id,
        from_stage_id,
        to_stage_id,
        trigger_type,
        reason,
        metadata,
        created_at
      ) VALUES (
        chat_record.chat_id,
        NULL,
        default_stage_id,
        'system',
        'Initial stage assignment - migrated existing chat',
        '{"migration": true, "version": "048"}'::jsonb,
        CURRENT_TIMESTAMP
      );
    END LOOP;

  END LOOP;

  RAISE NOTICE 'Migration complete: % default stages created, % chats assigned to stages', stages_created, chats_assigned;
END $$;

-- Create index on chat_stage_assignments.chat_id if not exists (for performance)
CREATE INDEX IF NOT EXISTS idx_chat_stage_assignments_chat_id ON chat_stage_assignments(chat_id);

COMMENT ON COLUMN chat_stage_assignments.stage_id IS 'Current workflow stage of the chat - NULL means unassigned';
