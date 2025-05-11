-- Remove headerClass column from static_content
ALTER TABLE static_content DROP COLUMN header_class;

-- Remove headerClass column from static_content_version
ALTER TABLE static_content_version DROP COLUMN header_class;