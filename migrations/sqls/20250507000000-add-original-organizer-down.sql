-- Remove foreign key constraint
ALTER TABLE `event` DROP FOREIGN KEY fk_event_original_organizer;

-- Drop original_organizer_id column
ALTER TABLE `event` DROP COLUMN original_organizer_id;