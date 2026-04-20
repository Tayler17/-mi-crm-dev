-- 08_schedules_schema.sql
-- Schedules (horarios de atención) — extensible para AI futura

CREATE TABLE IF NOT EXISTS schedules (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    timezone     TEXT NOT NULL DEFAULT 'UTC',
    is_active    BOOLEAN DEFAULT TRUE,
    -- AI extensibility fields (poblados en fase AI)
    ai_enabled          BOOLEAN DEFAULT FALSE,
    ai_fallback_message TEXT,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_hours (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 1=Mon...6=Sat
    open_time   TIME,      -- NULL = cerrado ese día
    close_time  TIME,
    is_closed   BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(schedule_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedule_hours_schedule ON schedule_hours(schedule_id);

CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
