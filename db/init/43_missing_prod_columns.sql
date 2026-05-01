-- 43_missing_prod_columns.sql
-- Columns that exist in dev DB but were never captured in init scripts.
-- Safe to run multiple times (all use IF NOT EXISTS / idempotent).

-- ── Plans: extended columns ────────────────────────────────────────────────────
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_call_minutes        INT          DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_own_api_keys      BOOLEAN      DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_overage           BOOLEAN      DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS extra_message_price     NUMERIC(10,2) DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS extra_call_minute_price NUMERIC(10,2) DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_product_id       TEXT;

-- ── Conversations: group-chat flag ────────────────────────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Users: extended columns ──────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability             TEXT         DEFAULT 'online';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token             VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at        TIMESTAMPTZ;

-- ── Campaigns: call-bot and channel columns ───────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bot_id        UUID REFERENCES call_bots(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS inbox_id      UUID REFERENCES inboxes(id)   ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS connection_id UUID;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS queue_id      UUID REFERENCES queues(id)    ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS error_log     TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_contacts INT DEFAULT 0;
