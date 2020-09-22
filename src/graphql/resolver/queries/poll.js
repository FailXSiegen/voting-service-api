import { findPollsWithNoResults } from '../../../repository/poll/poll-repository'

export default {
  pollsWithNoResults: async (_, { eventId }, context) => {
    return await findPollsWithNoResults(eventId)
  }
}
