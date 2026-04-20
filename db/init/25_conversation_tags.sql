-- 25_conversation_tags.sql
-- Tags on individual conversations

CREATE TABLE IF NOT EXISTS conversation_tags (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tag_id          UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag      ON conversation_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_tenant   ON conversation_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_conv     ON conversation_tags(conversation_id);
