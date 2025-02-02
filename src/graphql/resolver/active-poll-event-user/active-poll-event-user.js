import { findOneById } from "../../../repository/poll/poll-repository";
import { findByPollResultId } from "../../../repository/poll/poll-user-voted-repository";
import { findByPollResultId as findAnswersByPollResultId } from "../../../repository/poll/poll-answer-repository";
import { findByEventId } from "../../../repository/poll/poll-user-repository";

export default {
  poll: async ({ poll }) => {
    return await findOneById(poll);
  },
  pollUserVoted: async ({ pollResultId }) => {
    return await findByPollResultId(pollResultId);
  },
  pollUser: async ({ poll }) => {
    return await findByEventId(poll);
  },
  pollAnswers: async ({ poll, pollResultId }) => {
    const { type } = await findOneById(poll);
    // if the poll type is not public, do not return the answers.
    if (type !== 1) {
      return null;
    }
    return await findAnswersByPollResultId(pollResultId);
  },
};
