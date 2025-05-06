-- Add original_organizer_id field to event table
ALTER TABLE `event` ADD COLUMN original_organizer_id int(11) DEFAULT NULL;

-- Add foreign key constraint for original_organizer_id
ALTER TABLE `event` ADD CONSTRAINT fk_event_original_organizer FOREIGN KEY (original_organizer_id) REFERENCES organizer(id);