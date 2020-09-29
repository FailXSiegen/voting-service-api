import { findClosedPollResults, findActivePoll } from '../../../repository/poll/poll-result-repository'

export default {
  pollResult: async (_, { eventId }, context) => {
    return await findClosedPollResults(eventId)
  },
  activePoll: async (_, { eventId }, context) => {
    return await findActivePoll(eventId)
  }
}
