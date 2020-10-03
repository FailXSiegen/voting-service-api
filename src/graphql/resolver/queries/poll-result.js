import { findClosedPollResults, findActivePoll, findActivePollEventUser } from '../../../repository/poll/poll-result-repository'

export default {
  pollResult: async (_, { eventId, page, pageSize }, context) => {
    return await findClosedPollResults(eventId, page, pageSize)
  },
  activePoll: async (_, { eventId }, context) => {
    return await findActivePoll(eventId)
  },
  activePollEventUser: async (_, { eventId }, context) => {
    return await findActivePollEventUser(eventId)
  }
}
