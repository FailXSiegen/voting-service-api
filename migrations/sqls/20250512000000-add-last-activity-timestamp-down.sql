-- Remove last_activity timestamp field from event_user table
ALTER TABLE `event_user` DROP COLUMN `last_activity`;