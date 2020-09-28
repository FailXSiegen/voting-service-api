import { findPollsWithNoResults, findActivePoll } from '../../../repository/poll/poll-repository'

export default {
  pollsWithNoResults: async (_, { eventId }, context) => {
    return await findPollsWithNoResults(eventId)
  },
  activePoll: async (_, { eventId }, context) => {
    return await findActivePoll(eventId)
  }
}
