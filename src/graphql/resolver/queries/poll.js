import {
  findPollsWithNoResults,
  findOneById,
  findPollsByEventId,
} from "../../../repository/poll/poll-repository";

export default {
  poll: async (_, { id }) => {
    return await findOneById(id);
  },
  pollsWithNoResults: async (_, { eventId }) => {
    return await findPollsWithNoResults(eventId);
  },
  polls: async (_, { eventId }) => {
    return await findPollsByEventId(eventId);
  },
};
