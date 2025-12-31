-- Migration: Add Customer Reactions table
-- Customer reactions are reactions from WhatsApp customers on ANY message (inbound or outbound)
-- This is separate from message_reactions which stores CRM user reactions

CREATE TABLE IF NOT EXISTS customer_reactions (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR NOT NULL,
    wa_message_id VARCHAR,
    chat_id VARCHAR NOT NULL,
    sender_phone VARCHAR NOT NULL,
    emoji VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_customer_message_reaction UNIQUE (message_id, sender_phone)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_customer_reactions_message_id ON customer_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_customer_reactions_chat_id ON customer_reactions(chat_id);
CREATE INDEX IF NOT EXISTS idx_customer_reactions_sender_phone ON customer_reactions(sender_phone);

COMMENT ON TABLE customer_reactions IS 'Stores reactions from WhatsApp customers on any message in the conversation';
COMMENT ON COLUMN customer_reactions.message_id IS 'Our internal message ID';
COMMENT ON COLUMN customer_reactions.wa_message_id IS 'WhatsApp message ID from reaction webhook (may differ from our stored ID due to wamid encoding)';
COMMENT ON COLUMN customer_reactions.chat_id IS 'Chat ID for filtering';
COMMENT ON COLUMN customer_reactions.sender_phone IS 'Customer phone number who reacted';
COMMENT ON COLUMN customer_reactions.emoji IS 'Reaction emoji (null if removed)';
COMMENT ON COLUMN customer_reactions.is_active IS 'Whether the reaction is active (false if removed)';
