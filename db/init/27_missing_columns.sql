-- ── Missing columns not yet in init scripts ───────────────────────────────────

-- ai_chatbots: memory_conversations (number of messages to keep in context)
ALTER TABLE ai_chatbots
  ADD COLUMN IF NOT EXISTS memory_conversations INT NOT NULL DEFAULT 5;

-- contacts: extra profile fields
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- conversations: channel linking and tracking fields
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES channel_connections(id) ON DELETE SET NULL;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- messages: external_id for dedup (WhatsApp/webhook message ID)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON messages(external_id);

-- contact_tags: junction table for contact ↔ tag relation
CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag     ON contact_tags(tag_id);

-- campaigns: fix timestamp columns to include timezone info
ALTER TABLE campaigns ALTER COLUMN scheduled_at TYPE TIMESTAMPTZ USING scheduled_at AT TIME ZONE 'UTC';
ALTER TABLE campaigns ALTER COLUMN started_at    TYPE TIMESTAMPTZ USING started_at    AT TIME ZONE 'UTC';
ALTER TABLE campaigns ALTER COLUMN completed_at  TYPE TIMESTAMPTZ USING completed_at  AT TIME ZONE 'UTC';

-- ai_chatbot_sessions: fix contact_id FK to allow contact deletion
ALTER TABLE ai_chatbot_sessions
  DROP CONSTRAINT IF EXISTS ai_chatbot_sessions_contact_id_fkey;
ALTER TABLE ai_chatbot_sessions
  ADD CONSTRAINT ai_chatbot_sessions_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- WhatsApp LID → real phone persistent map (survives API restarts)
CREATE TABLE IF NOT EXISTS wa_lid_map (
  connection_id UUID    NOT NULL,
  lid_digits    TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (connection_id, lid_digits)
);

-- WhatsApp Baileys auth persistence (survives container restarts)
CREATE TABLE IF NOT EXISTS wa_session_creds (
  connection_id UUID PRIMARY KEY,
  creds         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wa_session_keys (
  connection_id UUID    NOT NULL,
  key_type      TEXT    NOT NULL,
  key_id        TEXT    NOT NULL,
  key_data      JSONB   NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (connection_id, key_type, key_id)
);
