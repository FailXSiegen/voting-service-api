-- Fix data type mismatch for foreign key
ALTER TABLE static_content_version 
  MODIFY COLUMN content_id bigint(20) unsigned;

-- Add missing foreign keys to static_content_version table
ALTER TABLE static_content_version 
  ADD CONSTRAINT fk_static_content_version_content_id 
  FOREIGN KEY (content_id) REFERENCES static_content (id) ON DELETE CASCADE;

ALTER TABLE static_content_version 
  ADD CONSTRAINT fk_static_content_version_changed_by 
  FOREIGN KEY (changed_by) REFERENCES organizer (id) ON DELETE SET NULL;