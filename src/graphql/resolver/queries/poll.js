import {
  findPollsWithNoResults,
  findOneById,
  findPollsByEventId,
} from "../../../repository/poll/poll-repository";
import { isAsyncEventStarted } from "../../../repository/event-repository";
import { getUserVoteCycle } from "../../../repository/poll/poll-user-voted-repository";
import { findOneByPollId } from "../../../repository/poll/poll-result-repository";
import { findOneById as findEventUserById } from "../../../repository/event-user-repository";
import { query } from "../../../lib/database";

export default {
  poll: async (_, { id }) => {
    return await findOneById(id);
  },
  pollsWithNoResults: async (_, { eventId }, context) => {
    // Organizers können immer alle Polls sehen, auch vor dem Start von async Events
    const isOrganizer = context?.user?.type === 'organizer';
    
    if (!isOrganizer) {
      // Nur für Event-User: Prüfe ob asynchrone Events gestartet sind
      const canShowPolls = await isAsyncEventStarted(eventId);
      if (!canShowPolls) {
        return []; // Keine Polls für noch nicht gestartete async Events
      }
    }
    
    return await findPollsWithNoResults(eventId);
  },
  polls: async (_, { eventId }, context) => {
    // Organizers können immer alle Polls sehen, auch vor dem Start von async Events
    const isOrganizer = context?.user?.type === 'organizer';
    
    if (!isOrganizer) {
      // Nur für Event-User: Prüfe ob asynchrone Events gestartet sind
      const canShowPolls = await isAsyncEventStarted(eventId);
      if (!canShowPolls) {
        return []; // Keine Polls für noch nicht gestartete async Events
      }
    }
    
    return await findPollsByEventId(eventId);
  },
  userVoteCycle: async (_, { eventUserId, pollId }) => {
    console.log(`[DEBUG:USER_VOTE_CYCLE] Query aufgerufen mit eventUserId=${eventUserId}, pollId=${pollId}`);
    try {
      // Parameter validieren
      if (!eventUserId || !pollId) {
        console.error("Query.userVoteCycle: Fehlende Parameter:", { eventUserId, pollId });
        return { voteCycle: 0, maxVotes: 0 };
      }

      const pollResult = await findOneByPollId(pollId);
      console.log(`[DEBUG:USER_VOTE_CYCLE] pollResult gefunden:`, pollResult);
      if (!pollResult) {
        console.log(`[DEBUG:USER_VOTE_CYCLE] Kein pollResult gefunden für pollId=${pollId}`);
        return { voteCycle: 0, maxVotes: 0 };
      }

      const eventUser = await findEventUserById(eventUserId);
      console.log(`[DEBUG:USER_VOTE_CYCLE] eventUser gefunden:`, eventUser?.id, eventUser?.voteAmount);
      if (!eventUser) {
        console.log(`[DEBUG:USER_VOTE_CYCLE] Kein eventUser gefunden für eventUserId=${eventUserId}`);
        return { voteCycle: 0, maxVotes: 0 };
      }

      let userVote = null;
      if (pollResult) {
        userVote = await getUserVoteCycle(pollResult.id, eventUserId);
        console.log(`[DEBUG:USER_VOTE_CYCLE] getUserVoteCycle Ergebnis:`, userVote);
      }

      // Prüfe auf Diskrepanz zwischen vote_cycle und version
      if (pollResult) {
        const versionQuery = await query(
          `SELECT vote_cycle AS voteCycle, version FROM poll_user_voted
         WHERE poll_result_id = ? AND event_user_id = ?`,
          [pollResult.id, eventUserId]
        );

        if (Array.isArray(versionQuery) && versionQuery.length > 0) {
          const dbVoteCycle = parseInt(versionQuery[0].voteCycle, 10) || 0;
          const dbVersion = parseInt(versionQuery[0].version, 10) || 0;

          if (dbVoteCycle !== dbVersion) {
            console.warn(`[WARN] Query.userVoteCycle: Diskrepanz zwischen voteCycle (${dbVoteCycle}) und version (${dbVersion}) gefunden!`);
            const maxValue = Math.max(dbVoteCycle, dbVersion);

            if (userVote) {
              userVote.voteCycle = maxValue;
            }
          }
        }
      }

      const voteCycle = userVote?.voteCycle || 0;

      return {
        voteCycle: voteCycle,
        maxVotes: eventUser.voteAmount || 0
      };
    } catch (error) {
      console.error("Fehler beim Abrufen des Vote-Cycle für Query:", error, "für Parameter:", { pollId, eventUserId });
      return { voteCycle: 0, maxVotes: 0 };
    }
  },
};
