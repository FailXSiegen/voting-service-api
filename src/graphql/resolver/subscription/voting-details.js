import { filter, pipe } from 'graphql-yoga';
import { canAccessEvent } from '../../authorize';
import { lookup } from '../../authorize-lookup';
import { POLL_ANSWER_LIFE_CYCLE } from './subscription-types';
import { pubsub } from '../../../server/graphql';
import { findOneById as findOnePollResultById } from '../../../repository/poll/poll-result-repository';

const EMPTY = { state: 'active', poll: null, pollResultId: null };

export default {
  votingDetailsUpdate: {
    subscribe: (_, args, context) => {
      const allowed = canAccessEvent(args.eventId, context?.user, lookup).catch(() => false);
      return pipe(
        pubsub.subscribe(POLL_ANSWER_LIFE_CYCLE),
        filter(async (payload) => {
          if (!(await allowed)) {
            return false;
          }
          if (!args.eventId || !payload.eventId) {
            return false;
          }
          return parseInt(payload.eventId, 10) === parseInt(args.eventId, 10);
        })
      );
    },
    // Nur Poll- und Result-ID liefern; die Felder löst der Typ ActivePollEventUser auf
    // (active-poll-event-user.js). Dort werden Einzelstimmen nach Poll-Typ aus der DB
    // gefiltert – geheime Abstimmungen liefern nie pollAnswers (SEC-23).
    resolve: async (payload) => {
      const pollResultId = parseInt(payload?.pollResultId, 10);
      if (!Number.isInteger(pollResultId) || pollResultId <= 0) {
        return EMPTY;
      }
      const pollResult = await findOnePollResultById(pollResultId);
      if (!pollResult?.pollId) {
        return EMPTY;
      }
      return { state: 'active', poll: pollResult.pollId, pollResultId };
    },
  },
};
