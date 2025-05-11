'use strict';

module.exports = {
  async up(db) {
    return db.runSql(`
      -- Add headerClass column to static_content
      ALTER TABLE static_content ADD COLUMN header_class VARCHAR(20) DEFAULT 'h2' AFTER title;
      
      -- Add headerClass to the version table as well
      ALTER TABLE static_content_version ADD COLUMN header_class VARCHAR(20) DEFAULT 'h2' AFTER title;
    `);
  },

  async down(db) {
    return db.runSql(`
      -- Remove headerClass column from static_content
      ALTER TABLE static_content DROP COLUMN header_class;
      
      -- Remove headerClass column from static_content_version
      ALTER TABLE static_content_version DROP COLUMN header_class;
    `);
  }
};