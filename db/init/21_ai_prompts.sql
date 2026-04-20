-- ── AI Prompts ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_prompts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  category     TEXT NOT NULL DEFAULT 'general',
  prompt_text  TEXT NOT NULL,
  variables    JSONB NOT NULL DEFAULT '[]',  -- [{name, description, example}]
  provider     TEXT NOT NULL DEFAULT 'openai',
  model        TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  temperature  NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  max_tokens   INT NOT NULL DEFAULT 300,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  usage_count  INT NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_prompts_tenant   ON ai_prompts(tenant_id);
CREATE INDEX idx_ai_prompts_category ON ai_prompts(tenant_id, category);

CREATE TRIGGER update_ai_prompts_updated_at
  BEFORE UPDATE ON ai_prompts
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
