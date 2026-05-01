-- ── Knowledge Base (RAG) ─────────────────────────────────────────────────────

-- pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Allowed domains per tenant (tenants can only scrape their own sites)
CREATE TABLE IF NOT EXISTS tenant_allowed_domains (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL,
  domain     TEXT        NOT NULL,  -- e.g. "miempresa.com"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, domain)
);

-- Knowledge sources linked to a bot (URL or PDF)
CREATE TABLE IF NOT EXISTS bot_knowledge_sources (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL,
  bot_id         UUID        NOT NULL REFERENCES ai_chatbots(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL CHECK (type IN ('url', 'pdf')),
  url            TEXT,
  file_name      TEXT,
  file_path      TEXT,
  title          TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','indexing','indexed','error')),
  error_message  TEXT,
  chunk_count    INT         NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chunked text with embeddings (1536 dims = OpenAI text-embedding-3-small)
CREATE TABLE IF NOT EXISTS bot_knowledge_chunks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  bot_id      UUID        NOT NULL,
  source_id   UUID        NOT NULL REFERENCES bot_knowledge_sources(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  embedding   vector(1536),
  chunk_index INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cosine-distance index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON bot_knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_bot
  ON bot_knowledge_chunks (bot_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_bot
  ON bot_knowledge_sources (bot_id, tenant_id);
