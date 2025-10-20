-- Remove favicon_url and title_suffix columns from system_settings table
ALTER TABLE system_settings 
DROP COLUMN favicon_url,
DROP COLUMN title_suffix;