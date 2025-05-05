import { getUserVoteCycle } from "../../../repository/poll/poll-user-voted-repository";
import { findOneByPollId } from "../../../repository/poll/poll-result-repository";
import { findOneById } from "../../../repository/event-user-repository";
import { query } from "../../../lib/database";

export default {
  userVoteCycle: async function (_, args) {
    try {

      if (!args) {
        console.error("userVoteCycle: Keine Parameter übergeben!");
        return { voteCycle: 0, maxVotes: 0 };
      }

      const { eventUserId, pollId } = args;

      // Parameter validieren
      if (!eventUserId || !pollId) {
        console.error("Fehlende Parameter:", { eventUserId, pollId });
        return { voteCycle: 0, maxVotes: 0 };
      }

      const pollResult = await findOneByPollId(pollId);

      if (!pollResult) {
        return { voteCycle: 0, maxVotes: 0 };
      }

      const eventUser = await findOneById(eventUserId);

      if (!eventUser) {
        return { voteCycle: 0, maxVotes: 0 };
      }

      let userVote = null;
      if (pollResult) {
        userVote = await getUserVoteCycle(pollResult.id, eventUserId);
      }

      // ZUSÄTZLICHE PRÜFUNG: Prüfe, ob version und vote_cycle synchron sind
      // Bei Diskrepanz nutze den höheren Wert, um sicherzustellen, dass der Benutzer keine zusätzlichen Stimmen erhält
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
            console.warn(`[WARN] userVoteCycle: Diskrepanz zwischen voteCycle (${dbVoteCycle}) und version (${dbVersion}) gefunden!`);
            // Nutze den höheren Wert, um sicherzustellen, dass der Benutzer nicht mehr Stimmen abgeben kann, als erlaubt
            const maxValue = Math.max(dbVoteCycle, dbVersion);

            if (userVote) {
              userVote.voteCycle = maxValue;
            }
          }
        }
      }

      // Vorrang hat die direkte Abfrage über alle poll_results
      const voteCycle = userVote?.voteCycle || 0;

      const response = {
        voteCycle: voteCycle,
        maxVotes: eventUser.voteAmount || 0
      };

      return response;
    } catch (error) {
      console.error("Fehler beim Abrufen des Vote-Cycle:", error, "für Parameter:", args);
      return { voteCycle: 0, maxVotes: 0 };
    }
  }
}