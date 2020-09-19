import { findOneById, update } from '../../../repository/event-user-repository'

export default {
  updateEventUser: async (_, args, context) => {
    const eventUser = await findOneById(args.input.id)
    if (!eventUser) {
      throw new Error('EventUser not found')
    }
    await update(args.input)
    return await findOneById(args.input.id)
  },
  updateEventUserVerified: async (_, args, context) => {
    const eventUser = await findOneById(args.input.id)
    if (!eventUser) {
      throw new Error('EventUser not found')
    }
    await update(args.input)
    return await findOneById(args.input.id)
  }
}
