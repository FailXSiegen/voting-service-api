import {
  findClosedPollResults,
  findActivePoll,
  findActivePollEventUser,
} from "../../../repository/poll/poll-result-repository";

export default {
  pollResult: async (_, { eventId, page, pageSize, includeHidden }) => {
    return await findClosedPollResults(eventId, page, pageSize, includeHidden || false);
  },
  activePoll: async (_, { eventId }) => {
    return await findActivePoll(eventId);
  },
  activePollEventUser: async (_, { eventId }) => {
    return await findActivePollEventUser(eventId);
  },
};
