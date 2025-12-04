-- Migration: Combine country code and phone number into E.164 format
-- This migration updates existing contacts to store the full phone number
-- in the phoneNumber field instead of storing it separately in countryCode and phoneNumber

BEGIN;

-- Update all active contacts to combine countryCode and phoneNumber
UPDATE contacts
SET phone_number = CONCAT(country_code, phone_number)
WHERE is_active = true
  AND phone_number ~ '^\d+$'  -- Only update if phoneNumber contains only digits
  AND country_code ~ '^\+\d{1,3}$';  -- Only if countryCode is in +XXX format

-- Update all inactive contacts (soft-deleted) as well for consistency
UPDATE contacts
SET phone_number = CONCAT(country_code, phone_number)
WHERE is_active = false
  AND phone_number ~ '^\d+$'
  AND country_code ~ '^\+\d{1,3}$';

COMMIT;
