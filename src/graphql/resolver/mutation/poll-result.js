import { togglePollResultHidden } from "../../../repository/poll/poll-result-repository";

export default {
  togglePollResultHidden: async (_, { pollResultId }) => {
    const success = await togglePollResultHidden(pollResultId);
    return success;
  },
};
