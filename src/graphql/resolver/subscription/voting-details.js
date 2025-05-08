import { filter, pipe } from "graphql-yoga";
import { POLL_ANSWER_LIFE_CYCLE } from "./subscription-types";
import { pubsub } from "../../../server/graphql";

// Import nötige Repository-Funktionen
import { findByPollResultId } from "../../../repository/poll/poll-user-voted-repository";
import { findByPollResultId as findAnswersByPollResultId } from "../../../repository/poll/poll-answer-repository";
import { findByEventId } from "../../../repository/poll/poll-user-repository";
import { findOneById as findOneByPollResultId } from "../../../repository/poll/poll-result-repository";

export default {
  // Separater Subscription-Endpunkt für VotingDetails, 
  // der auf das gleiche Event hört, aber nur die Details für die Anzeige aktualisiert
  votingDetailsUpdate: {
    subscribe: (_, args) =>
      pipe(
        pubsub.subscribe(POLL_ANSWER_LIFE_CYCLE),
        filter((payload) => {
          if (!args.eventId) {
            return false;
          }
          return parseInt(payload.eventId) === parseInt(args.eventId);
        }),
      ),
    resolve: async (payload, { eventId }) => {
      try {

        // Payload sollte pollResultId enthalten
        if (!payload || !payload.pollResultId) {
          return {
            state: "active",
            pollAnswers: [],
            pollUser: [],
            pollUserVoted: [],
            poll: { id: 0, title: "Keine Abstimmung aktiv", type: "PUBLIC" }
          };
        }

        // Sicherstellen, dass pollResultId eine Zahl ist
        let pollResultId;
        if (typeof payload.pollResultId === 'object' && payload.pollResultId !== null) {
          // Wenn es ein Objekt ist, die id-Eigenschaft verwenden oder toString
          pollResultId = payload.pollResultId.id || payload.pollResultId.toString();
        } else {
          pollResultId = payload.pollResultId;
        }

        // Immer zu einer Zahl konvertieren
        const numericPollResultId = parseInt(pollResultId, 10);
        if (isNaN(numericPollResultId)) {
          console.error(`[ERROR:VotingDetails] Invalid pollResultId: ${pollResultId}`);
          throw new Error(`Invalid pollResultId: ${pollResultId}`);
        }
        pollResultId = numericPollResultId;

        // Hole die Daten für die Anzeige
        const pollUserVoted = await findByPollResultId(pollResultId);
        const pollAnswers = await findAnswersByPollResultId(pollResultId);

        // Finde die zugehörige Poll-ID
        const pollData = await findOneByPollResultId(pollResultId);
        if (!pollData || !pollData.id) {
          console.warn('[DEBUG:VotingDetails] No poll data found for pollResultId:', pollResultId);
          return {
            state: "active",
            pollAnswers: pollAnswers || [],
            pollUserVoted: pollUserVoted || [],
            pollUser: [],
            poll: { id: 0, title: "Keine Poll-Daten gefunden", type: "PUBLIC" }
          };
        }

        // Sicherstellen, dass pollId eine Zahl ist
        let pollId;
        if (typeof pollData.id === 'object' && pollData.id !== null) {
          pollId = pollData.id.id || pollData.id.toString();
        } else {
          pollId = pollData.id;
        }

        // Immer zu einer Zahl konvertieren
        const numericPollId = parseInt(pollId, 10);
        if (isNaN(numericPollId)) {
          console.error(`[ERROR:VotingDetails] Invalid pollId: ${pollId}`);
          throw new Error(`Invalid pollId: ${pollId}`);
        }
        pollId = numericPollId;

        const pollUser = await findByEventId(pollId);

        // Stelle sicher, dass poll nicht null ist, bevor wir es zurückgeben
        // Der Fehler "Cannot read properties of null (reading 'type')" tritt auf, 
        // wenn poll null ist und in der GraphQL-Verarbeitung auf poll.type zugegriffen wird
        return {
          state: "active",
          pollAnswers: pollAnswers || [],
          pollUser: pollUser || [],
          pollUserVoted: pollUserVoted || [],
        };
      } catch (error) {
        console.error('[ERROR:VotingDetails] Error in votingDetailsUpdate resolver:', error);
        // Bei Fehler ein Minimal-Objekt zurückgeben
        return {
          state: "active",
          pollAnswers: [],
          pollUser: [],
          pollUserVoted: []
        };
      }
    },
  },
};