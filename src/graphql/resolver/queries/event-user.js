import {
  findEventUserByEventId,
  findOneById
} from '../../../repository/event-user-repository'

export default {
  eventUsers: async (_, args, context) => {
    return await findEventUserByEventId(args.eventId)
  },
  eventUser: async (_, args, context) => {
    return await findOneById(args.id)
  }
}
