-- Be cautious about dropping data, especially in production
-- Just drop the table if it exists
SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT * 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'static_page_slugs'
    ),
    'DROP TABLE static_page_slugs',
    'SELECT "Table does not exist"'
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;