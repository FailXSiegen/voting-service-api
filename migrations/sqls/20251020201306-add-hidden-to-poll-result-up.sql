-- Add hidden column to poll_result table (idempotent)
ALTER TABLE poll_result
ADD COLUMN IF NOT EXISTS hidden TINYINT(2) DEFAULT 0 NOT NULL AFTER closed;