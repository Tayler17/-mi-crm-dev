-- 44_voice_catalog.sql
-- Owner manages a global voice catalog; tenants select voices by name only

CREATE TABLE IF NOT EXISTS voices (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  description  TEXT,
  language     TEXT NOT NULL DEFAULT 'es-MX',
  gender       TEXT NOT NULL DEFAULT 'neutral',   -- neutral | female | male
  tts_provider TEXT NOT NULL DEFAULT 'twilio_basic', -- twilio_basic | openai_tts | elevenlabs
  tts_voice_id TEXT DEFAULT '',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_voices_updated_at
  BEFORE UPDATE ON voices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add voice catalog reference to call bots
ALTER TABLE call_bots
  ADD COLUMN IF NOT EXISTS voice_catalog_id UUID REFERENCES voices(id) ON DELETE SET NULL;

-- Default voice entries
INSERT INTO voices (name, description, language, gender, tts_provider, tts_voice_id, sort_order)
VALUES
  ('María – ES MX (Twilio)',    'Voz femenina en español mexicano',    'es-MX', 'female',  'twilio_basic', '',                    1),
  ('Miguel – ES MX (Twilio)',   'Voz masculina en español mexicano',   'es-MX', 'male',    'twilio_basic', '',                    2),
  ('Conchita – ES ES (Twilio)', 'Voz femenina en español de España',   'es-ES', 'female',  'twilio_basic', '',                    3),
  ('Joanna – EN US (Twilio)',   'Neutral US English female voice',     'en-US', 'female',  'twilio_basic', '',                    4),
  ('Matthew – EN US (Twilio)',  'Male US English voice',               'en-US', 'male',    'twilio_basic', '',                    5),
  ('Vitoria – PT BR (Twilio)',  'Voz feminina em português brasileiro','pt-BR', 'female',  'twilio_basic', '',                    6)
ON CONFLICT DO NOTHING;
