-- Add Meta Cloud API phone number ID to senders table
-- This field allows mapping incoming webhook messages to the correct sender

ALTER TABLE senders
ADD COLUMN phone_number_id VARCHAR(255);

-- Create partial unique index for phone_number_id (only on non-NULL values)
-- This allows multiple NULLs (for senders without Meta phone number ID set yet)
-- while ensuring non-NULL values are unique
CREATE UNIQUE INDEX idx_senders_phone_number_id_unique ON senders(phone_number_id) WHERE phone_number_id IS NOT NULL;

-- Create regular index for general lookup
CREATE INDEX idx_senders_phone_number_id ON senders(phone_number_id);
