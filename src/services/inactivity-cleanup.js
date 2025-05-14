/**
 * Inactivity Cleanup Service
 * 
 * Dieses Modul enthält die Logik zum automatischen Markieren von inaktiven Benutzern als offline.
 * Es berücksichtigt dabei Events mit aktiven Abstimmungen und schließt diese vom automatischen
 * Offline-Marking aus.
 */

import { query } from "../lib/database";
import { getCurrentUnixTimeStamp } from "../lib/time-stamp";
import { findEventsWithActivePoll } from "../repository/poll/poll-result-repository";

// Konfiguration für Inaktivitäts-Timeout in Sekunden (15 Minuten)
const INACTIVITY_TIMEOUT = 900;

/**
 * Startet den periodischen Inaktivitäts-Cleanup-Job
 * @param {number} interval - Intervall in Millisekunden für die Ausführung des Jobs (Standard: 60 Sekunden)
 * @returns {NodeJS.Timeout} - Handle für den Interval-Timer zum späteren Stoppen
 */
export function startInactivityCleanup(interval = 60000) {
  console.info(`[Inactivity Cleanup] Service started, checking every ${interval / 1000} seconds, timeout set to ${INACTIVITY_TIMEOUT} seconds`);

  // Job alle 60 Sekunden ausführen
  const cleanupInterval = setInterval(async () => {
    try {
      // Aktuelle Zeit abrufen
      const timestamp = getCurrentUnixTimeStamp();
      const cutoffTime = timestamp - INACTIVITY_TIMEOUT;

      // Events mit aktiven Abstimmungen abrufen - diese Benutzer werden nicht als offline markiert
      const eventsWithActivePoll = await findEventsWithActivePoll();

      // IDs der Events mit aktiven Abstimmungen extrahieren
      const activeEventIds = eventsWithActivePoll.map(event => event.id);

      // SQL für Update vorbereiten
      let sql = `
        UPDATE event_user 
        SET online = false 
        WHERE online = true 
        AND (last_activity IS NULL OR last_activity < ?)
      `;

      // Parameter für die Query vorbereiten
      const params = [cutoffTime];

      // Wenn es Events mit aktiven Abstimmungen gibt, diese ausschließen
      if (activeEventIds.length > 0) {
        sql += ` AND event_id NOT IN (${activeEventIds.map(() => '?').join(',')})`;
        params.push(...activeEventIds);
      }

      // Ausführen der Aktualisierung
      const result = await query(sql, params);

      if (result && result.affectedRows > 0) {
        console.info(`[Inactivity Cleanup] ${result.affectedRows} inaktive Benutzer als offline markiert`);
      }

      if (activeEventIds.length > 0) {
        console.info(`[Inactivity Cleanup] ${activeEventIds.length} Events mit aktiven Abstimmungen ausgeschlossen`);
      }
    } catch (error) {
      console.error('[Inactivity Cleanup] Fehler beim Aktualisieren inaktiver Benutzer:', error);
    }
  }, interval);

  // Cleanup-Job-Handle zurückgeben, um ihn später stoppen zu können
  return cleanupInterval;
}

/**
 * Stoppt den Inaktivitäts-Cleanup-Job
 * @param {NodeJS.Timeout} cleanupInterval - Das Handle für den Job, das von startInactivityCleanup zurückgegeben wurde
 */
export function stopInactivityCleanup(cleanupInterval) {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    console.info('[Inactivity Cleanup] Service stopped');
  }
}