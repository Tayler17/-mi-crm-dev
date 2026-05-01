-- Custom field definitions and values (per-tenant, multi-entity)
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  entity_type VARCHAR(30) NOT NULL,  -- 'contact', 'deal', 'conversation'
  name        VARCHAR(80) NOT NULL,
  label       VARCHAR(80) NOT NULL,
  field_type  VARCHAR(20) NOT NULL DEFAULT 'text',  -- text, number, date, select, checkbox, url
  options     JSONB,
  is_required BOOLEAN NOT NULL DEFAULT false,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  definition_id UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  entity_id     UUID NOT NULL,
  entity_type   VARCHAR(30) NOT NULL,
  value         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(definition_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_cfdef_tenant_entity ON custom_field_definitions(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_cfval_entity ON custom_field_values(tenant_id, entity_id);
