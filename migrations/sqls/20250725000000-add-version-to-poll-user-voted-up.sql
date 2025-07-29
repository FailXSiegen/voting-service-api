-- Add version column to poll_user_voted table
ALTER TABLE poll_user_voted 
ADD COLUMN version INT(11) DEFAULT 0 NOT NULL AFTER vote_cycle;