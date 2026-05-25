-- Stripe Connect: payment accounts per tenant
CREATE TABLE IF NOT EXISTS payment_accounts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider           TEXT        NOT NULL DEFAULT 'stripe',
  account_id         TEXT,
  charges_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  payouts_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  details_submitted  BOOLEAN     NOT NULL DEFAULT FALSE,
  onboarding_complete BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider)
);
