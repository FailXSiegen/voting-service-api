-- Add version column to poll_user_voted table (idempotent)
ALTER TABLE poll_user_voted
ADD COLUMN IF NOT EXISTS version INT(11) DEFAULT 0 NOT NULL AFTER vote_cycle;