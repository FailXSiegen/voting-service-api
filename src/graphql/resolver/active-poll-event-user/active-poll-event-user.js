import { findOneById } from '../../../repository/poll/poll-repository'
import { findByPollResultId } from '../../../repository/poll/poll-user-voted-repository'
import { findByEventId } from '../../../repository/poll/poll-user-repository'

export default {
  poll: async ({ poll }) => {
    return await findOneById(poll)
  },
  pollUserVoted: async ({ pollResultId }) => {
    return await findByPollResultId(pollResultId)
  },
  pollUser: async ({ poll }) => {
    return await findByEventId(poll)
  }
}
