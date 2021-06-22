import { findExpired, findUpcoming, findAllUpcomingEvents, findAllPastEvents } from '../../../repository/event-repository'

export default {
  upcomingEvents: async (_, args, context) => {
    return await findUpcoming(args.organizerId)
  },
  expiredEvents: async (_, args, context) => {
    return await findExpired(args.organizerId)
  },
  allUpcomingEvents: async (_, args, context) => {
    return await findAllUpcomingEvents()
  },
  allPastEvents: async (_, { page, pageSize }, context) => {
    return await findAllPastEvents(page, pageSize)
  }
}
