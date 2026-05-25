-- Add has_stripe_connect feature flag to plans
ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_stripe_connect BOOLEAN DEFAULT FALSE;
