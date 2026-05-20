-- 46_allow_own_twilio.sql
-- Adds allow_own_twilio flag to plans so tenants can configure their own Twilio credentials

ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_own_twilio BOOLEAN DEFAULT FALSE;
