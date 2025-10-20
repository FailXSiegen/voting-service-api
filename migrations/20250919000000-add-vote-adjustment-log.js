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

exports.up = function(db, callback) {
  const sql = `
    CREATE TABLE IF NOT EXISTS vote_adjustment_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      organizer_id INT,
      source_user_id INT NOT NULL,
      target_user_id INT NOT NULL,
      vote_amount INT NOT NULL,
      source_user_name VARCHAR(255),
      target_user_name VARCHAR(255),
      timestamp INT NOT NULL,
      action_type VARCHAR(50) NOT NULL DEFAULT 'transfer',
      notes TEXT,
      FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE CASCADE,
      FOREIGN KEY (organizer_id) REFERENCES organizer(id) ON DELETE SET NULL,
      FOREIGN KEY (source_user_id) REFERENCES event_user(id) ON DELETE CASCADE,
      FOREIGN KEY (target_user_id) REFERENCES event_user(id) ON DELETE CASCADE,
      INDEX idx_event_timestamp (event_id, timestamp),
      INDEX idx_event_action (event_id, action_type)
    ) ENGINE=InnoDB
  `;

  db.runSql(sql, callback);
};

exports.down = function(db, callback) {
  db.dropTable('vote_adjustment_log', callback);
};

exports._meta = {
  "version": 1
};