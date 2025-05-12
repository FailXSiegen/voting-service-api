-- Add last_activity timestamp field to event_user table to track user activity
ALTER TABLE `event_user` ADD COLUMN `last_activity` BIGINT DEFAULT NULL;