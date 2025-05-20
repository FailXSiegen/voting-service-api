import { filter, pipe } from "graphql-yoga";
import { POLL_ANSWER_LIFE_CYCLE } from "./subscription-types";
import { pubsub } from "../../../server/graphql";

export default {
  [POLL_ANSWER_LIFE_CYCLE]: {
    subscribe: (_, args) =>
      pipe(
        pubsub.subscribe(POLL_ANSWER_LIFE_CYCLE),
        filter((payload) => {

          // Always require eventId filtering to prevent unnecessary message delivery
          if (!args.eventId || !payload.eventId) {
            return false;
          }

          // Use strict equality check with parseInt for numeric comparison
          const matches = parseInt(payload.eventId, 10) === parseInt(args.eventId, 10);
          return matches;
        }),
      ),
    resolve: (payload) => {
      // Ensure we don't return more data than needed and provide defaults for safety
      if (!payload) return null;

      // Make sure ALL fields match exactly what client expects
      const result = {
        pollResultId: payload.pollResultId || 0,
        maxVotes: payload.maxVotes || 0,
        maxVoteCycles: payload.maxVoteCycles || 0,
        pollUserVoteCycles: payload.pollUserVoteCycles || 0,
        pollUserVotedCount: payload.pollUserVotedCount || 0,
        pollAnswersCount: payload.pollAnswersCount || 0,
        pollUserCount: payload.pollUserCount || 0,
        // Include usersCompletedVoting if available (added in newer versions)
        usersCompletedVoting: payload.usersCompletedVoting || 0,
        eventId: payload.eventId || 0
      };

      return result;
    },
  },
};
