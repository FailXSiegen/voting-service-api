import { findExpired, findUpcoming, findAllUpcomingEvents } from '../../../repository/event-repository'

export default {
  upcomingEvents: async (_, args, context) => {
    return await findUpcoming(args.organizerId)
  },
  expiredEvents: async (_, args, context) => {
    return await findExpired(args.organizerId)
  },
  allUpcomingEvents: async (_, args, context) => {
    return await findAllUpcomingEvents()
  }
}
