-- Add goal-based AI configuration columns
-- Supports the goal-based AI chatbot system with simple goal-driven prompts.

ALTER TABLE ai_configurations
ADD COLUMN IF NOT EXISTS goal_type VARCHAR(50) DEFAULT 'answer_faq',
ADD COLUMN IF NOT EXISTS goal_description TEXT;
