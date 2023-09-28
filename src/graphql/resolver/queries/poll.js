import { findPollsWithNoResults, findOneById } from '../../../repository/poll/poll-repository'

export default {
  poll: async (_, { id }, context) => {
    return await findOneById(id)
  },
  pollsWithNoResults: async (_, { eventId }, context) => {
    return await findPollsWithNoResults(eventId)
  }
}
