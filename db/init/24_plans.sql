-- 24_plans.sql
-- Plans & tenant billing module

-- ── Plans ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    slug         TEXT UNIQUE NOT NULL,
    description  TEXT,
    price        NUMERIC(10,2) DEFAULT 0,
    currency     TEXT DEFAULT 'USD',
    billing_period TEXT DEFAULT 'monthly', -- monthly | yearly | lifetime

    -- Feature limits (-1 = unlimited)
    max_users          INT DEFAULT 3,
    max_contacts       INT DEFAULT 1000,
    max_inboxes        INT DEFAULT 2,
    max_campaigns      INT DEFAULT 5,
    max_automations    INT DEFAULT 10,
    max_flows          INT DEFAULT 5,
    max_call_bots      INT DEFAULT 0,
    max_ai_chatbots    INT DEFAULT 0,
    max_messages_month INT DEFAULT 1000,

    -- Feature flags
    has_call_bots      BOOLEAN DEFAULT FALSE,
    has_ai_chatbots    BOOLEAN DEFAULT FALSE,
    has_automations    BOOLEAN DEFAULT TRUE,
    has_flows          BOOLEAN DEFAULT TRUE,
    has_reports        BOOLEAN DEFAULT FALSE,
    has_api_access     BOOLEAN DEFAULT FALSE,
    has_webhooks       BOOLEAN DEFAULT FALSE,

    is_active    BOOLEAN DEFAULT TRUE,
    is_public    BOOLEAN DEFAULT TRUE,  -- visible in pricing page
    position     INT DEFAULT 0,         -- display order
    color        TEXT DEFAULT '#6366f1',

    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_plans_updated_at
    BEFORE UPDATE ON plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Add plan_id to tenants ─────────────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE SET NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_notes TEXT;

-- ── Default plans seed ────────────────────────────────────────────────────────
INSERT INTO plans (name, slug, description, price, billing_period, position, color,
    max_users, max_contacts, max_inboxes, max_campaigns, max_automations, max_flows,
    max_call_bots, max_ai_chatbots, max_messages_month,
    has_call_bots, has_ai_chatbots, has_automations, has_flows, has_reports, has_api_access, has_webhooks)
VALUES
(
    'Gratis', 'free', 'Para equipos pequeños que están comenzando', 0, 'monthly', 1, '#6b7280',
    2, 500, 1, 2, 5, 2, 0, 0, 500,
    false, false, true, false, false, false, false
),
(
    'Starter', 'starter', 'Para negocios en crecimiento', 29, 'monthly', 2, '#6366f1',
    5, 5000, 3, 10, 20, 10, 0, 1, 5000,
    false, true, true, true, true, false, true
),
(
    'Pro', 'pro', 'Para equipos medianos con altos volúmenes', 79, 'monthly', 3, '#8b5cf6',
    15, 25000, 10, 50, 100, 30, 2, 3, 25000,
    true, true, true, true, true, true, true
),
(
    'Enterprise', 'enterprise', 'Solución completa sin límites', 199, 'monthly', 4, '#0891b2',
    -1, -1, -1, -1, -1, -1, -1, -1, -1,
    true, true, true, true, true, true, true
)
ON CONFLICT (slug) DO NOTHING;
