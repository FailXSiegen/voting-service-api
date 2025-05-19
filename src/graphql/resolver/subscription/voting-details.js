import { filter, pipe } from "graphql-yoga";
import { POLL_ANSWER_LIFE_CYCLE } from "./subscription-types";
import { pubsub } from "../../../server/graphql";

// Import nötige Repository-Funktionen
import { findByPollResultId } from "../../../repository/poll/poll-user-voted-repository";
import { findByPollResultId as findAnswersByPollResultId } from "../../../repository/poll/poll-answer-repository";
import { findByEventId } from "../../../repository/poll/poll-user-repository";
import { findOneById as findOneByPollResultId } from "../../../repository/poll/poll-result-repository";

export default {
  // Optimized subscription for voting details with improved performance
  // and reduced database queries
  votingDetailsUpdate: {
    subscribe: (_, args) =>
      pipe(
        pubsub.subscribe(POLL_ANSWER_LIFE_CYCLE),
        filter((payload) => {
          // Strict filtering to prevent unnecessary updates
          if (!args.eventId || !payload.eventId) {
            return false;
          }
          return parseInt(payload.eventId, 10) === parseInt(args.eventId, 10);
        }),
      ),
    resolve: async (payload, { eventId }) => {
      try {
        // Early return if no valid payload data
        if (!payload || !payload.pollResultId) {
          return {
            state: "active",
            pollAnswers: [],
            pollUser: [],
            pollUserVoted: [],
            poll: { id: 0, title: "Keine Abstimmung aktiv", type: "PUBLIC" }
          };
        }

        // Extract and validate pollResultId consistently
        const pollResultId = parseInt(
          typeof payload.pollResultId === 'object' && payload.pollResultId !== null
            ? (payload.pollResultId.id || payload.pollResultId.toString())
            : payload.pollResultId,
          10
        );

        if (isNaN(pollResultId) || pollResultId <= 0) {
          console.error(`[ERROR:VotingDetails] Invalid pollResultId: ${payload.pollResultId}`);
          return {
            state: "active",
            pollAnswers: [],
            pollUser: [],
            pollUserVoted: [],
            poll: { id: 0, title: "Ungültige Poll-ID", type: "PUBLIC" }
          };
        }

        // Run database queries in parallel for better performance
        const [pollUserVoted, pollAnswers, pollData] = await Promise.all([
          findByPollResultId(pollResultId),
          findAnswersByPollResultId(pollResultId),
          findOneByPollResultId(pollResultId)
        ]);

        // Handle case when poll data is not found
        if (!pollData || !pollData.id) {
          return {
            state: "active",
            pollAnswers: pollAnswers || [],
            pollUserVoted: pollUserVoted || [],
            pollUser: [],
            poll: { id: 0, title: "Keine Poll-Daten gefunden", type: "PUBLIC" }
          };
        }

        // Extract and validate pollId consistently
        const pollId = parseInt(
          typeof pollData.id === 'object' && pollData.id !== null
            ? (pollData.id.id || pollData.id.toString())
            : pollData.id,
          10
        );

        if (isNaN(pollId) || pollId <= 0) {
          console.error(`[ERROR:VotingDetails] Invalid pollId: ${pollData.id}`);
          return {
            state: "active",
            pollAnswers: pollAnswers || [],
            pollUserVoted: pollUserVoted || [],
            pollUser: [],
            poll: { id: 0, title: "Ungültige Poll-ID", type: "PUBLIC" }
          };
        }

        // Get poll users
        const pollUser = await findByEventId(pollId);

        // Return optimized response with safe defaults
        return {
          state: "active",
          pollAnswers: pollAnswers || [],
          pollUser: pollUser || [],
          pollUserVoted: pollUserVoted || [],
          poll: pollData
        };
      } catch (error) {
        console.error('[ERROR:VotingDetails] Error in votingDetailsUpdate resolver:', error);
        // Minimal object on error
        return {
          state: "active",
          pollAnswers: [],
          pollUser: [],
          pollUserVoted: [],
          error: error.message
        };
      }
    },
  },
};