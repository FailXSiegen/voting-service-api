-- Create static_content_version table
CREATE TABLE IF NOT EXISTS static_content_version (
  id int(11) NOT NULL AUTO_INCREMENT,
  content_id int(11) NOT NULL,
  content text NOT NULL,
  title varchar(255) DEFAULT NULL,
  version int(11) NOT NULL DEFAULT 1,
  changed_by int(11) DEFAULT NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_static_content_version_content_id (content_id),
  INDEX idx_static_content_version_version (version)
);

-- Add missing foreign keys to static_content_version table
ALTER TABLE static_content_version 
  ADD CONSTRAINT fk_static_content_version_content_id 
  FOREIGN KEY (content_id) REFERENCES static_content (id) ON DELETE CASCADE;

ALTER TABLE static_content_version 
  ADD CONSTRAINT fk_static_content_version_changed_by 
  FOREIGN KEY (changed_by) REFERENCES organizer (id) ON DELETE SET NULL;