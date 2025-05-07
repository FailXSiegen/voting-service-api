-- Remove content editor column from organizer
ALTER TABLE organizer DROP COLUMN IF EXISTS can_edit_content;

-- Drop main content table with its constraints and indices
DROP TABLE IF EXISTS static_content;