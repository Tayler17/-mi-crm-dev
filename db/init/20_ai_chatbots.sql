-- ── AI Chatbots ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_chatbots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'inactive', -- active, inactive, draft
  provider       TEXT NOT NULL DEFAULT 'openai',   -- openai, anthropic, gemini
  model          TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  system_prompt  TEXT,
  welcome_message TEXT,
  fallback_message TEXT DEFAULT 'Lo siento, no entendí tu mensaje. ¿Puedes reformularlo?',
  handoff_keyword TEXT DEFAULT 'agente',
  handoff_message TEXT DEFAULT 'Enseguida te conecto con un agente humano.',
  max_tokens     INT NOT NULL DEFAULT 500,
  temperature    NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  inbox_ids      UUID[] DEFAULT '{}',
  total_conversations INT NOT NULL DEFAULT 0,
  handoff_count  INT NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chatbot_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chatbot_id      UUID NOT NULL REFERENCES ai_chatbots(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id),
  contact_id      UUID REFERENCES contacts(id),
  status          TEXT NOT NULL DEFAULT 'active', -- active, handed_off, ended
  message_count   INT NOT NULL DEFAULT 0,
  handed_off_at   TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_chatbots_tenant      ON ai_chatbots(tenant_id);
CREATE INDEX idx_ai_chatbot_sessions_bot ON ai_chatbot_sessions(chatbot_id);

CREATE TRIGGER update_ai_chatbots_updated_at
  BEFORE UPDATE ON ai_chatbots
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
