-- Remove hidden column from poll_result table
ALTER TABLE poll_result
DROP COLUMN IF EXISTS hidden;