-- Migration: Add System Admin Role and Customizable AI Goal Prompts
-- Description: 
--   1. Adds is_system_admin column to users table for global admin privileges
--   2. Creates system_ai_goal_prompts table for customizable AI goal prompts
--   3. Sets user with id=1 as system admin
--   4. Seeds default goal prompts from the hardcoded values

-- ============================================================================
-- PART 1: Add is_system_admin column to users table
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system_admin BOOLEAN DEFAULT false;

-- Set user with id=1 as system admin
UPDATE users SET is_system_admin = true WHERE id = 1;

-- ============================================================================
-- PART 2: Create system_ai_goal_prompts table
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_ai_goal_prompts (
    id SERIAL PRIMARY KEY,
    goal_type VARCHAR(50) NOT NULL UNIQUE, -- 'answer_faq', 'qualify_lead', 'book_appointment', 'handle_support', 'custom'
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    prompt_template TEXT NOT NULL, -- The actual prompt text
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id)
);

-- Create index for goal_type lookups
CREATE INDEX IF NOT EXISTS idx_system_ai_goal_prompts_goal_type ON system_ai_goal_prompts(goal_type);
CREATE INDEX IF NOT EXISTS idx_system_ai_goal_prompts_is_active ON system_ai_goal_prompts(is_active) WHERE is_active = true;

-- ============================================================================
-- PART 3: Seed default goal prompts
-- ============================================================================

INSERT INTO system_ai_goal_prompts (goal_type, display_name, description, prompt_template, is_active)
VALUES 
(
    'answer_faq',
    'Answer FAQs',
    'Answer customer questions accurately using the available knowledge base.',
    'Answer customer questions accurately using the available knowledge base. Provide specific details (prices, features, availability) when available. If you don''t have the information, let them know an agent will follow up. When customers share their name or details, acknowledge naturally and use their name in future responses.',
    true
),
(
    'qualify_lead',
    'Qualify Leads',
    'Qualify incoming leads by understanding their needs and budget.',
    'Qualify incoming leads by understanding their needs and budget. Ask relevant discovery questions (timeline, budget, requirements, decision makers). When customers share their name, contact info, or preferences, acknowledge this information naturally (e.g., "Thanks for sharing that, [Name]" or "I''ve noted your budget of X"). Share relevant information from the knowledge base to keep them engaged. When a lead is qualified, suggest connecting with an agent for next steps.',
    true
),
(
    'book_appointment',
    'Book Appointments',
    'Help customers schedule appointments or meetings.',
    'Help customers schedule appointments or meetings. Collect necessary information: preferred date/time, type of service, contact details. When customers provide their name, email, or preferences, confirm you''ve noted the information (e.g., "I have you down as [Name] for [date/time]" or "I''ll send confirmation to [email]"). Provide available options from the knowledge base when possible. Confirm all details before finalizing.',
    true
),
(
    'handle_support',
    'Handle Support',
    'Provide customer support by troubleshooting issues and answering questions.',
    'Provide customer support by troubleshooting issues and answering questions. Be empathetic and patient. When customers introduce themselves, use their name to personalize the interaction. If they share contact details for follow-up, acknowledge receipt. Search the knowledge base for solutions. If the issue requires human intervention, offer to connect with a support agent. Always acknowledge the customer''s frustration and provide clear next steps.',
    true
),
(
    'custom',
    'Custom Goal',
    'Custom-defined AI behavior based on provided instructions.',
    'Assist the customer based on the additional context provided below. Be helpful, accurate, and professional in all interactions. When customers share personal information, acknowledge it naturally.',
    true
)
ON CONFLICT (goal_type) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    prompt_template = EXCLUDED.prompt_template,
    updated_at = now();

-- ============================================================================
-- PART 4: Create system_ai_settings table for global AI settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_ai_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    updated_by INTEGER REFERENCES users(id)
);

-- Seed profile data collection instructions as a system setting
INSERT INTO system_ai_settings (setting_key, setting_value, description)
VALUES (
    'profile_data_collection_instructions',
    '{
        "full": "==========================================================================\nCUSTOMER DATA COLLECTION - IMPORTANT\n==========================================================================\n\nWhen customers share personal information, acknowledge it naturally and continue the conversation.\nThe system will automatically save this information to their profile.\n\nTYPES OF DATA TO LOOK FOR:\n1. Name: When customers introduce themselves (e.g., \"I''m Carlos\", \"My name is María García\")\n   - Acknowledge: \"Nice to meet you, Carlos!\" or naturally use their name\n2. Email: When shared for confirmation or follow-up (e.g., \"my email is john@example.com\")\n   - Acknowledge: \"I''ve noted your email. You''ll receive confirmation there.\"\n3. Phone: When customers provide an ADDITIONAL contact number\n   - Acknowledge: \"I have that number noted for follow-up.\"\n4. Preferences: Dates, times, budget, requirements, locations\n   - Acknowledge: \"I''ve noted your preference for [what they mentioned].\"\n\nDATA HANDLING RULES:\n- Always confirm you''ve \"noted\" or \"saved\" important information\n- Use the customer''s name naturally after they provide it\n- Don''t ask for information they''ve already given\n- If they correct information (e.g., \"Actually, it''s María, not Maria\"), acknowledge the correction\n- Never read back sensitive data like full email or phone out loud\n\nEXAMPLE INTERACTIONS:\nCustomer: \"Hi, I''m Carlos Mendoza and I''m interested in the Flow House\"\nAI: \"Hello Carlos! It''s great to hear from you. I''d be happy to help you with information about Flow House...\"\n\nCustomer: \"You can reach me at carlos@email.com for the booking confirmation\"\nAI: \"I''ve noted your email address. You''ll receive the booking confirmation there. Now, regarding the visit...\"\n\nCustomer: \"My wife''s number is +59178901234 in case I''m unavailable\"\nAI: \"Thank you for providing an alternative contact number. I''ve saved it for our records...\"",
        "compact": "DATA COLLECTION: When customers share personal info (name, email, phone, preferences):\n- Acknowledge naturally: \"Thanks, Carlos!\" / \"I''ve noted your email\"\n- Use their name after they share it\n- Don''t re-ask for info they''ve given"
    }'::jsonb,
    'Instructions for how AI should collect and acknowledge customer profile data'
)
ON CONFLICT (setting_key) DO NOTHING;

COMMENT ON TABLE system_ai_goal_prompts IS 'Stores customizable AI goal prompts that apply globally to all users/teams';
COMMENT ON TABLE system_ai_settings IS 'Stores global AI settings that apply to all users/teams';
COMMENT ON COLUMN users.is_system_admin IS 'If true, user has system-wide administrative privileges';
