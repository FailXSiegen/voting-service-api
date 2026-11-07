import { getCurrentUnixTimeStamp } from './time-stamp.js';
import { query } from './database.js';

// no-console-check

/**
 * Logger für Benutzerstimmen-Anpassungen
 * Erstellt separate Logs pro Event für Organisatoren
 */

/**
 * Loggt eine Stimmenübertragung. Das Protokoll wird nur angefügt, nie geändert oder gelöscht
 * (SEC-30). Mit `tx` (siehe withTransaction) wird der Eintrag in derselben Transaktion wie die
 * Übertragung geschrieben – scheitert er, wird auch die Übertragung zurückgerollt.
 */
export async function logVoteTransfer(
  {
    eventId,
    organizerId,
    sourceUserId,
    targetUserId,
    voteAmount,
    sourceUserName,
    targetUserName,
    sourceUserRemainingVotes,
  },
  tx = null
) {
  const row = [
    eventId,
    organizerId,
    sourceUserId,
    targetUserId,
    voteAmount,
    sourceUserName,
    targetUserName,
    getCurrentUnixTimeStamp(),
    'transfer',
    sourceUserRemainingVotes !== undefined ? String(sourceUserRemainingVotes) : null,
  ];
  const sql = `INSERT INTO vote_adjustment_log
    (event_id, organizer_id, source_user_id, target_user_id, vote_amount, source_user_name,
     target_user_name, timestamp, action_type, notes)
    VALUES (?)`;

  if (tx) {
    await tx.query(sql, [row]);
  } else {
    await query(sql, [row], { throwError: true });
  }
  console.log(`[INFO] Vote transfer logged: ${voteAmount} votes in event ${eventId}`);
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
  return logs
    .map((log) => {
      const date = new Date(log.timestamp * 1000);
      const dateStr = date.toLocaleString('de-DE', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      // camelCase Konvertierung berücksichtigen
      const sourceUser =
        log.sourceUserName ||
        log.source_user_name ||
        `ID: ${log.sourceUserId || log.source_user_id}`;
      const targetUser =
        log.targetUserName ||
        log.target_user_name ||
        `ID: ${log.targetUserId || log.target_user_id}`;
      const voteAmount = log.voteAmount || log.vote_amount;

      let logLine = `${dateStr} - ${voteAmount} Stimme(n) von ${sourceUser} an ${targetUser} übertragen`;

      if (log.notes !== null && log.notes !== undefined) {
        logLine += ` - ${sourceUser} hat nach Übertragung ${log.notes} Stimmen übrig`;
      }

      return logLine;
    })
    .join('\n');
}
