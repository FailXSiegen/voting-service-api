import { findExpired, findUpcoming } from '../../../repository/event-repository'

export default {
  upcomingEvents: async (_, args, context) => {
    console.log('hit')
    return await findUpcoming(args.organizerId)
  },
  expiredEvents: async (_, args, context) => {
    return await findExpired(args.organizerId)
  }
}
