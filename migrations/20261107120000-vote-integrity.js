'use strict';

// Audit 2026-11-07 (SEC-04, SEC-23, SEC-30):
// 1. poll_user_voted: doppelte Zeilen je (poll_result_id, event_user_id) zusammenführen und
//    einen Unique-Constraint anlegen. Zusammenführung konservativ: höchster vote_cycle/version
//    bleibt (= am wenigsten Reststimmen), die Zeile mit der kleinsten id bleibt erhalten.
//    poll_answer wird nicht angefasst – die abgegebenen Stimmen bleiben unverändert.
// 2. poll_answer.id auf BIGINT: geheime Stimmen bekommen zufällige IDs (keine Reihenfolge).
// 3. vote_adjustment_log: Fremdschlüssel auf event_user (ON DELETE CASCADE) entfernen,
//    damit das Protokoll beim Löschen von Teilnehmern erhalten bleibt.

var dbm;
var type;
var seed;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

async function foreignKeys(db, table, referencedTable) {
  const rows = await db.runSql(
    `SELECT DISTINCT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME = ?`,
    [table, referencedTable]
  );
  return (rows || []).map((row) => row.name);
}

async function indexExists(db, table, index) {
  const rows = await db.runSql(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  );
  return (rows || []).length > 0;
}

exports.up = async function (db) {
  // 1. Duplikate zusammenführen, dann Unique-Constraint.
  await db.runSql(`
    UPDATE poll_user_voted p
    INNER JOIN (
      SELECT MIN(id) AS keep_id, MAX(vote_cycle) AS vote_cycle, MAX(version) AS version
      FROM poll_user_voted
      GROUP BY poll_result_id, event_user_id
      HAVING COUNT(*) > 1
    ) d ON d.keep_id = p.id
    SET p.vote_cycle = d.vote_cycle, p.version = d.version
  `);
  await db.runSql(`
    DELETE p FROM poll_user_voted p
    INNER JOIN poll_user_voted k
      ON k.poll_result_id = p.poll_result_id
     AND k.event_user_id = p.event_user_id
     AND k.id < p.id
  `);
  if (!(await indexExists(db, 'poll_user_voted', 'uq_poll_user_voted_result_user'))) {
    await db.runSql(
      'ALTER TABLE poll_user_voted ADD UNIQUE INDEX uq_poll_user_voted_result_user (poll_result_id, event_user_id)'
    );
  }

  // 2. poll_answer.id BIGINT (zufällige IDs für geheime Stimmen).
  await db.runSql('ALTER TABLE poll_answer MODIFY id BIGINT NOT NULL AUTO_INCREMENT');

  // 3. Protokoll nicht mehr mit Teilnehmern löschen.
  for (const name of await foreignKeys(db, 'vote_adjustment_log', 'event_user')) {
    await db.runSql(`ALTER TABLE vote_adjustment_log DROP FOREIGN KEY \`${name}\``);
  }
};

exports.down = async function (db) {
  if (await indexExists(db, 'poll_user_voted', 'uq_poll_user_voted_result_user')) {
    await db.runSql('ALTER TABLE poll_user_voted DROP INDEX uq_poll_user_voted_result_user');
  }
  // Zufällige IDs geheimer Stimmen passen nicht mehr in INT – nur zurückstellen, wenn möglich.
  const rows = await db.runSql('SELECT COALESCE(MAX(id), 0) AS maxId FROM poll_answer');
  if (Number(rows?.[0]?.maxId || 0) <= 2147483647) {
    await db.runSql('ALTER TABLE poll_answer MODIFY id INT(11) NOT NULL AUTO_INCREMENT');
  }
  // Die Fremdschlüssel auf event_user werden bewusst nicht wiederhergestellt: Protokolleinträge
  // zu inzwischen gelöschten Teilnehmern würden das Anlegen verhindern.
};

exports._meta = {
  version: 1,
};
