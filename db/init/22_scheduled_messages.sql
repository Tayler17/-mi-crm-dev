-- Scheduled messages: messages queued to be sent at a future date/time

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  body            TEXT NOT NULL,
  content_type    VARCHAR(50) NOT NULL DEFAULT 'text',
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled')),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_msg_conversation ON scheduled_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sched_msg_tenant_status ON scheduled_messages(tenant_id, status, scheduled_at);
