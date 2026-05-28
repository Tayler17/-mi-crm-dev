-- 56_max_phone_numbers.sql
-- Add max_phone_numbers limit to plans (controls how many Twilio call-bot numbers a tenant can have)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_phone_numbers INT DEFAULT -1;
