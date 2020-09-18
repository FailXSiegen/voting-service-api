import { findExpired, findUpcoming } from '../../../repository/event-repository'
import { findEventUserByEvent } from '../../../repository/event-user-repository'

export default {
  upcomingEvents: async (_, args, context) => {
    return await findUpcoming(args.organizerId)
  },
  expiredEvents: async (_, args, context) => {
    return await findExpired(args.organizerId)
  },
  findEventUserByEvent: async (_, args, context) => {
    return await findEventUserByEvent(args.eventId, args.verified)
  }
}
