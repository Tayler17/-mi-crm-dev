-- TTS provider columns for call_bots
ALTER TABLE call_bots
  ADD COLUMN IF NOT EXISTS tts_provider   TEXT NOT NULL DEFAULT 'twilio_basic',
  ADD COLUMN IF NOT EXISTS tts_voice_id   TEXT;          -- used for ElevenLabs voice ID

-- Uploads dir hint (actual mkdir is in Dockerfile)
-- /app/uploads/tts  →  served at GET /tts/:filename
