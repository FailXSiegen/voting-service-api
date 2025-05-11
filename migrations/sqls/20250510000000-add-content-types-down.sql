-- Remove added columns from static_content
ALTER TABLE static_content DROP COLUMN accordion_items;
ALTER TABLE static_content DROP COLUMN columns_content;
ALTER TABLE static_content DROP COLUMN column_count;
ALTER TABLE static_content DROP COLUMN content_type;

-- Remove added columns from static_content_version
ALTER TABLE static_content_version DROP COLUMN accordion_items;
ALTER TABLE static_content_version DROP COLUMN columns_content;
ALTER TABLE static_content_version DROP COLUMN column_count;
ALTER TABLE static_content_version DROP COLUMN content_type;