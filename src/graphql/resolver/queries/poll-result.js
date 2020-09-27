import { findClosedPollResults } from '../../../repository/poll/poll-result-repository'

export default {
  pollResult: async (_, { eventId }, context) => {
    return await findClosedPollResults(eventId)
  }
}
