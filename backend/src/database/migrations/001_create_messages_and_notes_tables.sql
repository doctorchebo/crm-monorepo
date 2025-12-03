-- Migration: 001_create_messages_and_notes_tables.sql
-- Description: Create tables for storing WhatsApp message metadata and user notes

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  message_id VARCHAR UNIQUE NOT NULL,
  chat_id VARCHAR NOT NULL,
  source VARCHAR NOT NULL, -- 'whatsapp', 'messenger', etc
  sender VARCHAR NOT NULL, -- WhatsApp phone number
  type VARCHAR NOT NULL, -- 'text', 'image', 'video'
  text TEXT,
  media_url TEXT,
  timestamp TIMESTAMP NOT NULL
);

-- Create index on message_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);

-- Create notes table
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  message_id VARCHAR NOT NULL REFERENCES messages(message_id),
  user_id INT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Create index on message_id and user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_notes_message_id ON notes(message_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);

-- Create senders table to link users with WhatsApp business phone numbers
CREATE TABLE IF NOT EXISTS senders (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR NOT NULL,
  twilio_phone_number_sid VARCHAR,
  twilio_messaging_service_sid VARCHAR,
  is_active INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Create index on user_id and phone_number
CREATE INDEX IF NOT EXISTS idx_senders_user_id ON senders(user_id);
CREATE INDEX IF NOT EXISTS idx_senders_phone_number ON senders(phone_number);
