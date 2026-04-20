-- ── Conversation Flows ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_flows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  inbox_id      UUID REFERENCES inboxes(id) ON DELETE SET NULL,
  trigger_type  VARCHAR(50) DEFAULT 'new_conversation',  -- new_conversation | keyword | schedule
  trigger_value TEXT,                                    -- keyword value or cron expression
  steps         JSONB DEFAULT '[]',                      -- array of flow steps
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  flow_id       UUID NOT NULL REFERENCES conversation_flows(id) ON DELETE CASCADE,
  conversation_id UUID,
  contact_id    UUID,
  current_step  INT DEFAULT 0,
  variables     JSONB DEFAULT '{}',
  status        VARCHAR(50) DEFAULT 'active',  -- active | completed | abandoned
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flows_tenant   ON conversation_flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_flows_inbox    ON conversation_flows(inbox_id);
CREATE INDEX IF NOT EXISTS idx_sessions_flow  ON flow_sessions(flow_id);
CREATE INDEX IF NOT EXISTS idx_sessions_conv  ON flow_sessions(conversation_id);
