-- CSAT (Customer Satisfaction) responses
CREATE TABLE IF NOT EXISTS csat_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL,
  score         SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment       TEXT,
  token         VARCHAR(64) UNIQUE NOT NULL,
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csat_tenant ON csat_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_csat_conv   ON csat_responses(conversation_id);

-- Flag on conversations to track if CSAT was requested
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_requested_at TIMESTAMPTZ;
