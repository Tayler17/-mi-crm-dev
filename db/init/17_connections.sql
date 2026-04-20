-- ── Channel Connections ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channel_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          VARCHAR(255) NOT NULL,
  channel_type  VARCHAR(50) NOT NULL,   -- whatsapp | instagram | telegram | email | webchat
  status        VARCHAR(50) DEFAULT 'disconnected',  -- connected | disconnected | error | pending
  credentials   JSONB DEFAULT '{}',     -- channel-specific auth fields (encrypted in future)
  inbox_id      UUID REFERENCES inboxes(id) ON DELETE SET NULL,
  error_message TEXT,
  last_tested_at TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connections_tenant ON channel_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connections_type   ON channel_connections(channel_type);
CREATE INDEX IF NOT EXISTS idx_connections_inbox  ON channel_connections(inbox_id);
