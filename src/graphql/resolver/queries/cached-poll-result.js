/**
 * Cached Poll Result Resolver
 *
 * Dieser Resolver verwendet den Live Poll Cache anstatt direkte SQL-Abfragen.
 * Performance-Optimierung: Ein Timer macht alle 15 Sek. EINE SQL-Abfrage,
 * alle Clients lesen nur den Cache.
 */

import { livePollCache } from "../../../cache/live-poll-cache.js";
import { findActivePollEventUser } from "../../../repository/poll/poll-result-repository.js";

export default {
  /**
   * Cached Version des activePollEventUser Resolvers
   *
   * Startet Caching für die Event-ID und gibt gecachte Daten zurück.
   * Falls kein Cache existiert, wird einmalig direkt aus der DB gelesen.
   */
  cachedActivePollEventUser: async (_, { eventId }) => {
    try {
      console.log(`[CachedPollResolver] Anfrage für Event ${eventId}`);

      // Prüfe ob bereits gecacht
      let cachedData = livePollCache.getCachedData(eventId);

      if (cachedData) {
        // Cache Hit - verwende gecachte Daten
        console.log(`[CachedPollResolver] Cache Hit für Event ${eventId}`);
        return cachedData;
      }

      // Cache Miss - starte Caching und gib direkte Daten zurück
      console.log(`[CachedPollResolver] Cache Miss für Event ${eventId} - starte Caching`);

      // Starte Background-Caching
      livePollCache.startCaching(eventId);

      // Für sofortige Antwort: einmalig direkt aus DB laden (identisch zur originalen Funktion)
      const directData = await findActivePollEventUser(eventId);

      if (directData) {
        console.log(`[CachedPollResolver] Direkte Daten für Event ${eventId} geladen`);
        return directData;
      }

      // Fallback: Original Resolver
      console.log(`[CachedPollResolver] Fallback auf Original Resolver für Event ${eventId}`);
      return await findActivePollEventUser(eventId);

    } catch (error) {
      console.error(`[CachedPollResolver] Fehler für Event ${eventId}:`, error);

      // Fallback bei Fehlern: Original Resolver
      try {
        return await findActivePollEventUser(eventId);
      } catch (fallbackError) {
        console.error(`[CachedPollResolver] Auch Fallback fehlgeschlagen:`, fallbackError);
        return null;
      }
    }
  },


  /**
   * Debug: Cache-Statistiken
   */
  pollCacheStats: async () => {
    return livePollCache.getStats();
  }
};