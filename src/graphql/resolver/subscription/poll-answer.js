import { filter, pipe } from "graphql-yoga";
import { POLL_ANSWER_LIFE_CYCLE } from "./subscription-types";
import { pubsub } from "../../../server/graphql";

export default {
  [POLL_ANSWER_LIFE_CYCLE]: {
    subscribe: (_, args) =>
      pipe(
        pubsub.subscribe(POLL_ANSWER_LIFE_CYCLE),
        filter((payload) => {
          if (!args.eventId) {
            return true;
          }
          return parseInt(payload.eventId) === parseInt(args.eventId);
        }),
      ),
    resolve: (payload) => {
      // Stelle sicher, dass alle erforderlichen Felder vorhanden sind
      return {
        pollResultId: payload.pollResultId || 0,
        maxVotes: payload.maxVotes || 0,
        maxVoteCycles: payload.maxVoteCycles || 0,
        pollUserVoteCycles: payload.pollUserVoteCycles || 0,
        pollUserVotedCount: payload.pollUserVotedCount || 0,
        pollAnswersCount: payload.pollAnswersCount || 0,
        pollUserCount: payload.pollUserCount || 0,
        eventId: payload.eventId || 0
      };
    },
  },
};
