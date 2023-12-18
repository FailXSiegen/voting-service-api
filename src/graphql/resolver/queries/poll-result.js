import {
  findClosedPollResults,
  findActivePoll,
  findActivePollEventUser,
} from "../../../repository/poll/poll-result-repository";

export default {
  pollResult: async (_, { eventId, page, pageSize }) => {
    return await findClosedPollResults(eventId, page, pageSize);
  },
  activePoll: async (_, { eventId }) => {
    return await findActivePoll(eventId);
  },
  activePollEventUser: async (_, { eventId }) => {
    return await findActivePollEventUser(eventId);
  },
};
