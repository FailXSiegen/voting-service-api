import { getCurrentUnixTimeStamp } from "./time-stamp.js";
import { insert, query } from "./database.js";

/**
 * Logger für Benutzerstimmen-Anpassungen
 * Erstellt separate Logs pro Event für Organisatoren
 */

export async function createVoteAdjustmentLogTable() {
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

  try {
    await query(sql);
    console.log('[INFO] vote_adjustment_log Tabelle erstellt oder bereits vorhanden');
  } catch (error) {
    console.error('[ERROR] Fehler beim Erstellen der vote_adjustment_log Tabelle:', error);
    throw error;
  }
}

/**
 * Loggt eine Stimmenübertragung
 */
export async function logVoteTransfer({
  eventId,
  organizerId,
  sourceUserId,
  targetUserId,
  voteAmount,
  sourceUserName,
  targetUserName,
  sourceUserRemainingVotes
}) {
  const logEntry = {
    event_id: eventId,
    organizer_id: organizerId,
    source_user_id: sourceUserId,
    target_user_id: targetUserId,
    vote_amount: voteAmount,
    source_user_name: sourceUserName,
    target_user_name: targetUserName,
    timestamp: getCurrentUnixTimeStamp(),
    action_type: 'transfer',
    notes: sourceUserRemainingVotes !== undefined ? String(sourceUserRemainingVotes) : null
  };

  try {
    await insert('vote_adjustment_log', logEntry);
    console.log(`[INFO] Vote transfer logged: ${voteAmount} votes from ${sourceUserName} to ${targetUserName} in event ${eventId}`);
  } catch (error) {
    console.error('[ERROR] Fehler beim Loggen der Stimmenübertragung:', error);
    throw error;
  }
}

/**
 * Holt alle Vote-Anpassungen für ein Event
 */
export async function getVoteAdjustmentsByEventId(eventId) {
  const sql = `
    SELECT
      val.*,
      o.username as organizer_username,
      o.email as organizer_email
    FROM vote_adjustment_log val
    LEFT JOIN organizer o ON val.organizer_id = o.id
    WHERE val.event_id = ?
    ORDER BY val.timestamp DESC
  `;

  try {
    const results = await query(sql, [eventId]);
    return results || [];
  } catch (error) {
    console.error('[ERROR] Fehler beim Abrufen der Vote-Anpassungen:', error);
    throw error;
  }
}

/**
 * Konvertiert Logs zu TXT-Format
 */
export function convertLogsToTXT(logs) {
  return logs.map(log => {
    const date = new Date(log.timestamp * 1000);
    const dateStr = date.toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // camelCase Konvertierung berücksichtigen
    const sourceUser = log.sourceUserName || log.source_user_name || `ID: ${log.sourceUserId || log.source_user_id}`;
    const targetUser = log.targetUserName || log.target_user_name || `ID: ${log.targetUserId || log.target_user_id}`;
    const voteAmount = log.voteAmount || log.vote_amount;

    let logLine = `${dateStr} - ${voteAmount} Stimme(n) von ${sourceUser} an ${targetUser} übertragen`;

    if (log.notes !== null && log.notes !== undefined) {
      logLine += ` - ${sourceUser} hat nach Übertragung ${log.notes} Stimmen übrig`;
    }

    return logLine;
  }).join('\n');
}