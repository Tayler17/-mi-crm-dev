-- 30_webchat.sql
-- Webchat widget support for AI Chatbots

ALTER TABLE ai_chatbots
  ADD COLUMN IF NOT EXISTS webchat_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS webchat_color     TEXT NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS webchat_title     TEXT,
  ADD COLUMN IF NOT EXISTS webchat_subtitle  TEXT,
  ADD COLUMN IF NOT EXISTS webchat_placeholder TEXT DEFAULT 'Escribe un mensaje...';

CREATE TABLE IF NOT EXISTS webchat_sessions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_id         UUID NOT NULL REFERENCES ai_chatbots(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  visitor_id     TEXT,
  visitor_name   TEXT,
  visitor_email  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webchat_sessions_bot    ON webchat_sessions(bot_id);
CREATE INDEX IF NOT EXISTS idx_webchat_sessions_tenant ON webchat_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webchat_sessions_visitor ON webchat_sessions(bot_id, visitor_id);
