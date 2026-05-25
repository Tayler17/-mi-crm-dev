-- Fix: score was NOT NULL CHECK (1-5) but initial insert uses 0 (pending state)
-- Allow NULL score for pending CSAT requests; submitted ones always have score 1-5
ALTER TABLE csat_responses ALTER COLUMN score DROP NOT NULL;
ALTER TABLE csat_responses DROP CONSTRAINT IF EXISTS csat_responses_score_check;
ALTER TABLE csat_responses ADD CONSTRAINT csat_responses_score_check
  CHECK (score IS NULL OR score BETWEEN 1 AND 5);
