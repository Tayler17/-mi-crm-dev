-- 52_stripe_price_ids.sql
-- Stores Stripe Price IDs for each plan so they survive DB resets.
-- UPDATE these values after creating the products in Stripe Dashboard.
-- Leave as NULL to show "Contact us to upgrade" instead of a checkout button.
-- NOTE: The API connects to crm_dev (see DATABASE_URL in docker-compose.prod.yml)

UPDATE plans SET stripe_price_id = NULL WHERE slug = 'free';
UPDATE plans SET stripe_price_id = NULL WHERE slug = 'starter';
UPDATE plans SET stripe_price_id = NULL WHERE slug = 'pro';
UPDATE plans SET stripe_price_id = NULL WHERE slug = 'enterprise';

-- Once you have real Price IDs from Stripe, replace the '' with 'price_xxx...' for each plan.
-- Example:
-- UPDATE plans SET stripe_price_id = 'price_1OqXxxxxxxxxxxxx' WHERE slug = 'starter';
-- UPDATE plans SET stripe_price_id = 'price_1OqXyyyyyyyyyyyy' WHERE slug = 'pro';
-- UPDATE plans SET stripe_price_id = 'price_1OqXzzzzzzzzzzzz' WHERE slug = 'enterprise';
