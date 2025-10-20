/**
 * Live Poll Results Cache Manager
 *
 * Dieses Modul managed den Cache für Live-Abstimmungsergebnisse um SQL-Performance zu optimieren.
 * Anstatt bei jeder Client-Anfrage SQL-Queries auszuführen, wird ein Timer alle 15 Sekunden
 * EINE SQL-Abfrage gemacht und das Ergebnis gecacht.
 */

import { findByPollResultId } from "../repository/poll/poll-user-voted-repository.js";
import { findByPollResultId as findAnswersByPollResultId } from "../repository/poll/poll-answer-repository.js";
import { findByEventId } from "../repository/poll/poll-user-repository.js";
import { findOneById as findOneByPollResultId } from "../repository/poll/poll-result-repository.js";

class LivePollCache {
  constructor() {
    this.cache = new Map(); // cacheKey (eventId:pollId) -> cached data
    this.timers = new Map(); // eventId -> timer reference
    this.updateInterval = 15000; // 15 Sekunden
    this.globalTimer = null; // Globaler Timer für alle aktiven PUBLIC polls

    console.log('[LivePollCache] Cache Manager initialisiert');

    // Starte globalen Background-Service
    this.startGlobalCaching();
  }

  /**
   * Generiert Cache-Key aus eventId und pollId
   */
  getCacheKey(eventId, pollId) {
    return `${eventId}:${pollId}`;
  }

  /**
   * Startet globalen Background-Service für alle aktiven PUBLIC polls
   * Läuft wie Cronjob alle 15 Sekunden auf volle Sekunden (0, 15, 30, 45)
   */
  startGlobalCaching() {
    if (this.globalTimer) {
      console.log('[LivePollCache] Globaler Service läuft bereits');
      return;
    }

    console.log('[LivePollCache] Starte globalen Background-Service (Cronjob-Pattern)');

    // Sofortiges erstes Update
    this.updateAllActivePublicPolls();

    // Berechne Delay bis zur nächsten vollen 15-Sekunden-Marke
    const now = new Date();
    const currentSeconds = now.getSeconds();
    const nextInterval = Math.ceil(currentSeconds / 15) * 15;
    const delayMs = (nextInterval - currentSeconds) * 1000;

    console.log(`[LivePollCache] Sync auf nächste 15s-Marke in ${delayMs}ms`);

    // Initial-Delay bis zur Synchronisation
    setTimeout(() => {
      // Erstes synchronisiertes Update
      this.updateAllActivePublicPolls();

      // Timer für regelmäßige Updates alle 15 Sekunden
      this.globalTimer = setInterval(() => {
        this.updateAllActivePublicPolls();
      }, this.updateInterval);
    }, delayMs);
  }

  /**
   * Stoppt globalen Background-Service
   */
  stopGlobalCaching() {
    if (this.globalTimer) {
      clearInterval(this.globalTimer);
      this.globalTimer = null;
      console.log('[LivePollCache] Globaler Background-Service gestoppt');
    }
  }

  /**
   * Findet und aktualisiert alle aktiven PUBLIC polls mit publicVoteVisible = true
   */
  async updateAllActivePublicPolls() {
    try {
      console.log('[LivePollCache] Suche aktive PUBLIC polls...');

      // Dynamischer Import um Circular Dependencies zu vermeiden
      const { findActivePublicPollsWithVisibility } = await import("../repository/poll/poll-result-repository.js");

      // Hole alle aktiven PUBLIC polls mit publicVoteVisible = true
      const activePublicPolls = await findActivePublicPollsWithVisibility();

      if (!activePublicPolls || activePublicPolls.length === 0) {
        console.log('[LivePollCache] Keine aktiven PUBLIC polls gefunden');
        return;
      }

      console.log(`[LivePollCache] ${activePublicPolls.length} aktive PUBLIC polls gefunden`);

      // Aktualisiere Cache für jede gefundene Poll
      for (const pollInfo of activePublicPolls) {
        if (pollInfo.eventId && pollInfo.pollId) {
          await this.updateCacheForSpecificPoll(pollInfo.eventId, pollInfo.pollId);
        }
      }

    } catch (error) {
      console.error('[LivePollCache] Fehler beim Update aller aktiven polls:', error);
    }
  }

  /**
   * Aktualisiert Cache für eine spezifische Poll
   */
  async updateCacheForSpecificPoll(eventId, pollId) {
    try {
      const activePollData = await this.fetchActivePollData(eventId);

      if (activePollData && activePollData.poll?.id === pollId) {
        const cacheKey = this.getCacheKey(eventId, pollId);

        this.cache.set(cacheKey, {
          data: activePollData,
          timestamp: Date.now(),
          eventId: eventId,
          pollId: pollId
        });

        console.log(`[LivePollCache] Cache aktualisiert: ${cacheKey} - ${activePollData.pollUser?.length || 0} Teilnehmer`);
      }
    } catch (error) {
      console.error(`[LivePollCache] Fehler beim Update für Poll ${eventId}:${pollId}:`, error);
    }
  }

  /**
   * Startet Caching für eine Event-ID
   */
  startCaching(eventId) {
    if (!eventId) return;

    const eventIdStr = eventId.toString();

    // Verhindere doppelte Timer
    if (this.timers.has(eventIdStr)) {
      console.log(`[LivePollCache] Caching für Event ${eventIdStr} läuft bereits`);
      return;
    }

    console.log(`[LivePollCache] Starte Caching für Event ${eventIdStr}`);

    // Sofortiges erstes Update
    this.updateCache(eventIdStr);

    // Timer für regelmäßige Updates
    const timer = setInterval(() => {
      this.updateCache(eventIdStr);
    }, this.updateInterval);

    this.timers.set(eventIdStr, timer);
  }

  /**
   * Stoppt Caching für eine Event-ID
   */
  stopCaching(eventId) {
    const eventIdStr = eventId.toString();

    const timer = this.timers.get(eventIdStr);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(eventIdStr);
      console.log(`[LivePollCache] Caching für Event ${eventIdStr} gestoppt`);
    }

    // Cache optional behalten für kurze Zeit falls noch Clients zugreifen
    setTimeout(() => {
      this.cleanupAllCacheEntriesForEvent(eventIdStr);
      console.log(`[LivePollCache] Cache für Event ${eventIdStr} gelöscht`);
    }, 30000); // 30 Sekunden Nachhaltezeit
  }

  /**
   * Aktualisiert den Cache für eine Event-ID
   */
  async updateCache(eventId) {
    try {
      console.log(`[LivePollCache] Aktualisiere Cache für Event ${eventId}`);

      // Hole aktuelle Poll-Daten für dieses Event (identisch zur originalen Query)
      const { findActivePollEventUser } = await import("../repository/poll/poll-result-repository.js");
      const activePollData = await findActivePollEventUser(eventId);

      if (activePollData && activePollData.poll?.id) {
        // Cache-Key mit Poll-ID erstellen
        const cacheKey = this.getCacheKey(eventId, activePollData.poll.id);

        this.cache.set(cacheKey, {
          data: activePollData,
          timestamp: Date.now(),
          eventId: eventId,
          pollId: activePollData.poll.id
        });
        console.log(`[LivePollCache] Cache für Event ${eventId}, Poll ${activePollData.poll.id} aktualisiert - ${activePollData.pollUser?.length || 0} Teilnehmer`);

        // Alte Cache-Einträge für dieses Event (andere Poll-IDs) löschen
        this.cleanupOldCacheEntries(eventId, activePollData.poll.id);
      } else {
        // Keine aktive Poll - alle Cache-Einträge für dieses Event löschen
        this.cleanupAllCacheEntriesForEvent(eventId);
        console.log(`[LivePollCache] Keine aktive Poll für Event ${eventId} - Cache geleert`);
      }
    } catch (error) {
      console.error(`[LivePollCache] Fehler beim Cache-Update für Event ${eventId}:`, error);
    }
  }

  /**
   * Löscht alte Cache-Einträge für ein Event (andere Poll-IDs)
   */
  cleanupOldCacheEntries(eventId, currentPollId) {
    const keysToDelete = [];
    for (const [cacheKey, cacheData] of this.cache.entries()) {
      if (cacheData.eventId === eventId && cacheData.pollId !== currentPollId) {
        keysToDelete.push(cacheKey);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      console.log(`[LivePollCache] Alte Cache-Daten gelöscht: ${key}`);
    });
  }

  /**
   * Löscht alle Cache-Einträge für ein Event
   */
  cleanupAllCacheEntriesForEvent(eventId) {
    const keysToDelete = [];
    for (const [cacheKey, cacheData] of this.cache.entries()) {
      if (cacheData.eventId === eventId) {
        keysToDelete.push(cacheKey);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
    });
  }

  /**
   * Holt aktuelle Poll-Daten (EINE SQL-Abfrage statt viele)
   */
  async fetchActivePollData(eventId) {
    try {
      // Import hier um Circular Dependencies zu vermeiden
      const { findActivePollEventUser } = await import("../repository/poll/poll-result-repository.js");
      const { findOneById } = await import("../repository/poll/poll-repository.js");

      // Hole aktive Poll für dieses Event
      const activePollBasic = await findActivePollEventUser(eventId);
      console.log(`[DEBUG] fetchActivePollData für Event ${eventId}:`, activePollBasic);

      if (!activePollBasic || !activePollBasic.pollResultId) {
        console.log(`[DEBUG] Keine aktive Poll gefunden für Event ${eventId}`);
        return null;
      }

      const pollResultId = activePollBasic.pollResultId;

      // Parallel alle benötigten Daten laden (EINE SQL-Abfrage pro Datentyp)
      console.log(`[DEBUG] Loading data for pollResultId: ${pollResultId}, poll: ${activePollBasic.poll}`);
      const [pollUserVoted, pollAnswers, pollUser, pollData] = await Promise.all([
        findByPollResultId(pollResultId),
        findAnswersByPollResultId(pollResultId),
        findByEventId(eventId),
        findOneById(activePollBasic.poll)
      ]);
      console.log(`[DEBUG] Loaded data - pollData:`, pollData, 'pollUser count:', pollUser?.length);

      // Nur bei öffentlichen Abstimmungen Antworten zurückgeben
      const finalPollAnswers = pollData?.type === 1 ? pollAnswers : [];

      // Convert poll type from number to string enum for GraphQL
      const convertedPollData = pollData ? {
        ...pollData,
        type: pollData.type === 1 ? "PUBLIC" : "SECRET"
      } : null;

      return {
        state: activePollBasic.state || "active",
        pollResultId: pollResultId,
        pollAnswers: finalPollAnswers || [],
        pollUser: pollUser || [],
        pollUserVoted: pollUserVoted || [],
        poll: convertedPollData
      };

    } catch (error) {
      console.error(`[LivePollCache] Fehler beim Laden der Poll-Daten für Event ${eventId}:`, error);
      return null;
    }
  }

  /**
   * Gibt gecachte Daten zurück (findet automatisch die aktuelle Poll)
   */
  getCachedData(eventId) {
    const eventIdStr = eventId.toString();

    // Suche nach aktuellem Cache-Eintrag für dieses Event
    let mostRecentCache = null;
    let mostRecentTimestamp = 0;

    for (const [cacheKey, cacheData] of this.cache.entries()) {
      if (cacheData.eventId === eventIdStr && cacheData.timestamp > mostRecentTimestamp) {
        mostRecentCache = cacheData;
        mostRecentTimestamp = cacheData.timestamp;
      }
    }

    if (!mostRecentCache) {
      console.log(`[LivePollCache] Kein Cache für Event ${eventIdStr}`);
      return null;
    }

    const age = Date.now() - mostRecentCache.timestamp;
    console.log(`[LivePollCache] Cache-Hit für Event ${eventIdStr}, Poll ${mostRecentCache.pollId} (${Math.round(age/1000)}s alt)`);

    return mostRecentCache.data;
  }

  /**
   * Holt gecachte Daten für eine spezifische Event-ID und Poll-ID
   */
  getCachedDataForPoll(eventId, pollId) {
    const cacheKey = this.getCacheKey(eventId, pollId);
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      console.log(`[LivePollCache] Kein Cache für ${cacheKey}`);
      return null;
    }

    const age = Date.now() - cached.timestamp;
    console.log(`[LivePollCache] Cache-Hit für ${cacheKey} (${Math.round(age/1000)}s alt)`);

    return cached.data;
  }

  /**
   * Prüft ob Cache existiert und aktuell ist
   */
  isCacheValid(eventId, maxAge = 20000) { // 20 Sekunden max
    const eventIdStr = eventId.toString();

    // Suche nach aktuellem Cache-Eintrag für dieses Event
    let mostRecentTimestamp = 0;

    for (const [cacheKey, cacheData] of this.cache.entries()) {
      if (cacheData.eventId === eventIdStr && cacheData.timestamp > mostRecentTimestamp) {
        mostRecentTimestamp = cacheData.timestamp;
      }
    }

    if (mostRecentTimestamp === 0) return false;

    const age = Date.now() - mostRecentTimestamp;
    return age < maxAge;
  }

  /**
   * Cleanup - stoppt alle Timer
   */
  cleanup() {
    console.log('[LivePollCache] Cleanup - stoppe alle Timer');

    // Stoppe globalen Timer
    this.stopGlobalCaching();

    // Stoppe alle Event-spezifischen Timer
    this.timers.forEach((timer, eventId) => {
      clearInterval(timer);
      console.log(`[LivePollCache] Timer für Event ${eventId} gestoppt`);
    });
    this.timers.clear();
    this.cache.clear();
  }

  /**
   * Debug-Informationen
   */
  getStats() {
    return {
      cachedPollKeys: Array.from(this.cache.keys()),
      activeTimers: Array.from(this.timers.keys()),
      cacheEntries: this.cache.size,
      updateInterval: this.updateInterval
    };
  }
}

// Singleton instance
export const livePollCache = new LivePollCache();

// Graceful shutdown
process.on('SIGINT', () => {
  livePollCache.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  livePollCache.cleanup();
  process.exit(0);
});