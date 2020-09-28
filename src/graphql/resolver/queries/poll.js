import { findPollsWithNoResults, findPollsNotClosed } from '../../../repository/poll/poll-repository'

export default {
  pollsWithNoResults: async (_, { eventId }, context) => {
    return await findPollsWithNoResults(eventId)
  },
  pollsNotClosed: async (_, { eventId }, context) => {
    return await findPollsNotClosed(eventId)
  }
}
