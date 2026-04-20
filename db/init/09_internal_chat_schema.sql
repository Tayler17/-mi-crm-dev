-- Internal Chat: agent-to-agent messaging

CREATE TABLE IF NOT EXISTS internal_chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   VARCHAR(255) NOT NULL,
  name        VARCHAR(255),           -- null for DMs
  is_group    BOOLEAN DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_chat_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    UUID NOT NULL REFERENCES internal_chats(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  joined_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS internal_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID NOT NULL REFERENCES internal_chats(id) ON DELETE CASCADE,
  tenant_id   VARCHAR(255) NOT NULL,
  sender_id   UUID NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_chat_reads (
  chat_id    UUID NOT NULL REFERENCES internal_chats(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  read_at    TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_chats_tenant ON internal_chats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_internal_chat_members_user ON internal_chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_chat_messages_chat ON internal_chat_messages(chat_id);
