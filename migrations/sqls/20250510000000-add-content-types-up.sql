-- Add content_type column to static_content
ALTER TABLE static_content ADD COLUMN content_type VARCHAR(50) DEFAULT 'standard' AFTER section_key;

-- Add column_count for multi-column layouts
ALTER TABLE static_content ADD COLUMN column_count TINYINT DEFAULT NULL AFTER content;

-- Add columns_content to store column-specific content for multi-column layouts
ALTER TABLE static_content ADD COLUMN columns_content TEXT DEFAULT NULL AFTER column_count;

-- Add accordion_items to store multiple accordion items
ALTER TABLE static_content ADD COLUMN accordion_items TEXT DEFAULT NULL AFTER columns_content;

-- Add these fields to the version table as well
ALTER TABLE static_content_version ADD COLUMN content_type VARCHAR(50) DEFAULT 'standard' AFTER version;
ALTER TABLE static_content_version ADD COLUMN column_count TINYINT DEFAULT NULL AFTER content;
ALTER TABLE static_content_version ADD COLUMN columns_content TEXT DEFAULT NULL AFTER column_count;
ALTER TABLE static_content_version ADD COLUMN accordion_items TEXT DEFAULT NULL AFTER columns_content;