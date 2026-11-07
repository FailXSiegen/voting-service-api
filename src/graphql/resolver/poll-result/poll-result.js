import { findByPollResultId } from '../../../repository/poll/poll-answer-repository';
import { findByEventId } from '../../../repository/poll/poll-user-repository';
import { findOneById } from '../../../repository/poll/poll-repository';
import { findById as findEventById } from '../../../repository/event-repository';

function pollTypeConverter(typeId) {
  switch (typeId) {
    case 0:
      return 'SECRET';
    case 1:
      return 'PUBLIC';
    default:
      throw new Error(`the given type id "${typeId}" is not supported!`);
  }
}
export default {
  type: ({ type }) => {
    return pollTypeConverter(type);
  },
  poll: async ({ pollId }) => {
    return await findOneById(pollId);
  },
  pollUser: async ({ pollId }) => {
    return await findByEventId(pollId);
  },
  // Teilnehmer bekommen die Antworten zum Auszählen, die Zuordnung zur Person (pollUserId)
  // aber nur, wenn das Event Einzelstimmen öffentlich macht (publicVoteVisible).
  pollAnswer: async ({ id, pollId }, _args, context) => {
    const answers = await findByPollResultId(id);
    if (process.env.ENABLE_JWT !== '1' || context?.user?.type === 'organizer') {
      return answers;
    }
    const poll = await findOneById(pollId);
    const event = poll ? await findEventById(poll.eventId) : null;
    if (event?.publicVoteVisible) {
      return answers;
    }
    return (answers || []).map((answer) => ({ ...answer, pollUserId: null }));
  },
};
