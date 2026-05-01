-- Stripe integration columns

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT DEFAULT 'none';
