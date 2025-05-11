-- Add headerClass column to static_content
ALTER TABLE static_content ADD COLUMN header_class VARCHAR(20) DEFAULT 'h2' AFTER title;

-- Add headerClass to the version table as well
ALTER TABLE static_content_version ADD COLUMN header_class VARCHAR(20) DEFAULT 'h2' AFTER title;