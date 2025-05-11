'use strict';

/**
 * Migration to create a dedicated page slug mapping table
 * This replaces the previous approach of adding slugs to the static_content table
 */

const fs = require('fs');
const path = require('path');

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function(db) {
  return db.runSql(`
    -- Check if the static_page_slugs table already exists
    SET @table_exists = (
      SELECT COUNT(*)
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
      AND table_name = 'static_page_slugs'
    );
    
    -- Only create the table if it doesn't exist
    SET @sql = IF(@table_exists = 0, 
      'CREATE TABLE static_page_slugs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        page_key VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_page_key (page_key),
        UNIQUE KEY idx_slug (slug)
      )', 'SELECT "Table already exists"');
    
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    -- Generate default slugs for existing pages if the table was just created
    -- or if it exists but is empty
    SET @row_count = (SELECT COUNT(*) FROM static_page_slugs);
    
    SET @insert_sql = IF(@row_count = 0, 
      'INSERT IGNORE INTO static_page_slugs (page_key, slug)
      SELECT DISTINCT page_key, LOWER(REPLACE(REPLACE(REPLACE(page_key, " ", "-"), "_", "-"), ".", "-")) as slug
      FROM static_content', 'SELECT "Table already has data"');
      
    PREPARE insert_stmt FROM @insert_sql;
    EXECUTE insert_stmt;
    DEALLOCATE PREPARE insert_stmt;
  `);
};

exports.down = function(db) {
  // Be cautious about dropping data, especially in production
  // Just drop the table if it exists
  return db.runSql(`
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
  `);
};

exports._meta = {
  "version": 1
};