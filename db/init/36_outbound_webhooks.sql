-- Outbound webhooks: tenant-configured HTTP endpoints for CRM events
CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          VARCHAR(100) NOT NULL,
  url           TEXT NOT NULL,
  secret        VARCHAR(128),
  events        TEXT[] NOT NULL DEFAULT ARRAY['message_created','conversation_resolved','contact_created'],
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_tenant ON outbound_webhooks(tenant_id, is_active);
