import { findOneById } from '../../../repository/poll/poll-repository';
import { findById as findEventById } from '../../../repository/event-repository';
import { findByPollResultId } from '../../../repository/poll/poll-user-voted-repository';
import { findByPollResultId as findAnswersByPollResultId } from '../../../repository/poll/poll-answer-repository';
import { findByEventId } from '../../../repository/poll/poll-user-repository';

const POLL_TYPE_PUBLIC = 1;

// `poll` kommt je nach Quelle als ID (activePollEventUser, votingDetailsUpdate) oder als
// bereits geladenes Objekt (cachedActivePollEventUser).
const pollIdOf = (poll) => (poll && typeof poll === 'object' ? poll.id : poll);

// Teilnehmer sehen Einzelstimmen öffentlicher Abstimmungen nur, wenn das Event es erlaubt.
async function mayReadPublicAnswers(pollRecord, user) {
  if (process.env.ENABLE_JWT !== '1' || user?.type === 'organizer') {
    return true;
  }
  const event = await findEventById(pollRecord.eventId);
  return Boolean(event?.publicVoteVisible);
}

export default {
  poll: async ({ poll }) => {
    return await findOneById(pollIdOf(poll));
  },
  pollUserVoted: async ({ pollResultId }) => {
    return await findByPollResultId(pollResultId);
  },
  pollUser: async ({ poll }) => {
    return await findByEventId(pollIdOf(poll));
  },
  // SEC-23: Antworten nur bei öffentlichen Abstimmungen – Typ immer aus der DB.
  pollAnswers: async ({ poll, pollResultId }, _args, context) => {
    const pollRecord = await findOneById(pollIdOf(poll));
    if (!pollRecord || Number(pollRecord.type) !== POLL_TYPE_PUBLIC || !pollResultId) {
      return [];
    }
    if (!(await mayReadPublicAnswers(pollRecord, context?.user))) {
      return [];
    }
    return await findAnswersByPollResultId(pollResultId);
  },
};
