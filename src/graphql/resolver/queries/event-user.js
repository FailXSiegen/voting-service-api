import {
  findEventUserByEventId,
  findOneById,
  setEventUserOnline
} from '../../../repository/event-user-repository'

export default {
  eventUsers: async (_, args, context) => {
    return await findEventUserByEventId(args.eventId)
  },
  eventUser: async (_, args, context) => {
    await setEventUserOnline(args.id)
    return await findOneById(args.id)
  }
}
