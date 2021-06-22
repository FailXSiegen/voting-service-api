import { create, update, findOneBySlug, remove } from '../../../repository/event-repository'
import SlugAlreadyExistsError
  from '../../../errors/event/SlugAlreadyExistsError'

export default {
  createEvent: async (_, args, context) => {
    const existingEvent = await findOneBySlug(args.input.slug)
    if (existingEvent) {
      throw new SlugAlreadyExistsError()
    }
    await create(args.input)
    return await findOneBySlug(args.input.slug)
  },
  updateEvent: async (_, args, context) => {
    const existingEvent = await findOneBySlug(args.input.slug)
    if (existingEvent && parseInt(existingEvent.id) !== parseInt(args.input.id)) {
      throw new SlugAlreadyExistsError()
    }
    await update(args.input)
    return await findOneBySlug(args.input.slug)
  },
  updateEventStatus: async (_, args, context) => {
    await update(args.input)
    return true
  },
  removeEvent: async (_, args, context) => {
    return await remove(args.organizerId, args.id)
  }
}
