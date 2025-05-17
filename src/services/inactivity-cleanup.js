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

// Load-Test-Modus-Flag (kann über die Umgebungsvariable gesetzt werden)
const LOAD_TEST_MODE = process.env.LOAD_TEST_MODE === '1';

// Verlängerter Timeout für Load-Tests (2 Stunden)
const LOAD_TEST_INACTIVITY_TIMEOUT = 7200; // 2 Stunden

/**
 * Startet den periodischen Inaktivitäts-Cleanup-Job
 * @param {number} interval - Intervall in Millisekunden für die Ausführung des Jobs (Standard: 60 Sekunden)
 * @returns {NodeJS.Timeout} - Handle für den Interval-Timer zum späteren Stoppen
 */
export function startInactivityCleanup(interval = 60000) {
  // Timeout basierend auf dem Modus wählen
  const activeTimeout = LOAD_TEST_MODE ? LOAD_TEST_INACTIVITY_TIMEOUT : INACTIVITY_TIMEOUT;
  
  console.info(`[Inactivity Cleanup] Service started, checking every ${interval / 1000} seconds, timeout set to ${activeTimeout} seconds`);
  console.info(`[Inactivity Cleanup] Load-Test-Modus: ${LOAD_TEST_MODE ? 'AKTIV' : 'INAKTIV'}`);
  
  // Bei aktivem Load-Test-Modus Warnhinweis ausgeben
  if (LOAD_TEST_MODE) {
    console.info('[Inactivity Cleanup] ⚠️ LOAD-TEST-MODUS: Verlängerter Inaktivitäts-Timeout aktiv (2 Stunden)');
  }

  // Job alle 60 Sekunden ausführen
  const cleanupInterval = setInterval(async () => {
    try {
      // Aktuelle Zeit abrufen
      const timestamp = getCurrentUnixTimeStamp();
      
      // Im Load-Test-Modus längeren Timeout verwenden
      const activeTimeout = LOAD_TEST_MODE ? LOAD_TEST_INACTIVITY_TIMEOUT : INACTIVITY_TIMEOUT;
      const cutoffTime = timestamp - activeTimeout;

      // Events mit aktiven Abstimmungen abrufen - diese Benutzer werden nicht als offline markiert
      const eventsWithActivePoll = await findEventsWithActivePoll();

      // IDs der Events mit aktiven Abstimmungen extrahieren
      let activeEventIds = eventsWithActivePoll.map(event => event.id);
      
      // Bei aktivem Load-Test-Modus die Verarbeitung stark einschränken
      if (LOAD_TEST_MODE) {
        // Prüfen, ob wir eventuell einen "loadtest" Event haben oder einen mit "load" im Namen
        const loadTestEvents = await query(
          `SELECT id FROM event WHERE name LIKE '%load%' OR slug LIKE '%load%'`
        );
        
        if (Array.isArray(loadTestEvents) && loadTestEvents.length > 0) {
          const loadEventIds = loadTestEvents.map(e => e.id);
          console.info(`[Inactivity Cleanup] Load-Test-Events gefunden, IDs: ${loadEventIds.join(', ')}. Diese werden vom Cleanup ausgeschlossen.`);
          
          // Füge diese IDs zu den aktiven Event-IDs hinzu
          loadEventIds.forEach(id => {
            if (!activeEventIds.includes(id)) {
              activeEventIds.push(id);
            }
          });
        }
      }

      // SQL für Update vorbereiten
      let sql = `
        UPDATE event_user 
        SET online = false 
        WHERE online = true 
        AND (last_activity IS NULL OR last_activity < ?)
      `;

      // Parameter für die Query vorbereiten
      const params = [cutoffTime];

      // Im Load-Test-Modus können wir den Cleanup vollständig überspringen
      if (LOAD_TEST_MODE && process.env.DISABLE_CLEANUP_IN_LOADTEST === '1') {
        console.info(`[Inactivity Cleanup] Load-Test-Modus mit DISABLE_CLEANUP_IN_LOADTEST aktiv, überspringe Cleanup vollständig`);
        return;
      }
      
      // Wenn es Events mit aktiven Abstimmungen gibt, diese ausschließen
      if (activeEventIds.length > 0) {
        sql += ` AND event_id NOT IN (${activeEventIds.map(() => '?').join(',')})`;
        params.push(...activeEventIds);
      }
      
      // Im Load-Test-Modus einen Hinweis ausgeben
      if (LOAD_TEST_MODE) {
        console.info(`[Inactivity Cleanup] Load-Test-Modus aktiv. Timeout verlängert auf ${LOAD_TEST_INACTIVITY_TIMEOUT} Sekunden.`);
      }

      // Ausführen der Aktualisierung
      const result = await query(sql, params);

      if (result && result.affectedRows > 0) {
        console.info(`[Inactivity Cleanup] ${result.affectedRows} inaktive Benutzer als offline markiert`);
      }

      if (activeEventIds.length > 0) {
        console.info(`[Inactivity Cleanup] ${activeEventIds.length} Events mit aktiven Abstimmungen oder Load-Tests ausgeschlossen`);
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