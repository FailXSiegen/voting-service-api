-- Remove version column from poll_user_voted table
ALTER TABLE poll_user_voted 
DROP COLUMN version;