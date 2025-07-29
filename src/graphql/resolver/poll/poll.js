import { findByPollId } from "../../../repository/poll/poll-possible-answer-repository";
import { getUserVoteCycle } from "../../../repository/poll/poll-user-voted-repository";
import { findOneByPollId } from "../../../repository/poll/poll-result-repository";
import { findOneById } from "../../../repository/event-user-repository";
import { query } from "../../../lib/database";

export function pollTypeConverter(typeId) {
  switch (typeId) {
    case 0:
      return "SECRET";
    case 1:
      return "PUBLIC";
    default:
      throw new Error(`the given type id "${typeId}" is not supported!`);
  }
}
export function pollTypeConverterToString(typeString) {
  switch (typeString) {
    case "SECRET":
      return 0;
    case "PUBLIC":
      return 1;
    default:
      throw new Error(`the given type id "${typeString}" is not supported!`);
  }
}
export default {
  type: ({ type }) => {
    return pollTypeConverter(type);
  },
  possibleAnswers: async ({ id }) => {
    return await findByPollId(id);
  },
  userVoteCycle: async ({ id: pollId }, { eventUserId }) => {
    try {
      // Parameter validieren
      if (!eventUserId || !pollId) {
        console.error("Poll.userVoteCycle: Fehlende Parameter:", { eventUserId, pollId });
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
            console.warn(`[WARN] Poll.userVoteCycle: Diskrepanz zwischen voteCycle (${dbVoteCycle}) und version (${dbVersion}) gefunden!`);
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
      console.error("Fehler beim Abrufen des Vote-Cycle für Poll:", error, "für Parameter:", { pollId, eventUserId });
      return { voteCycle: 0, maxVotes: 0 };
    }
  },
};
