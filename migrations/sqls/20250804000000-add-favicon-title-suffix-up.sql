-- Add favicon_url and title_suffix columns to system_settings table
ALTER TABLE system_settings 
ADD COLUMN favicon_url VARCHAR(500) NULL,
ADD COLUMN title_suffix VARCHAR(255) NULL DEFAULT 'digitalwahl.org';