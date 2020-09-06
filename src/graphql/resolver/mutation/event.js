import { create, findBySlug } from '../../../repository/event-repository'
import SlugAlreadyExistsError
  from '../../../errors/event/SlugAlreadyExistsError'

export default {
  createEvent: async (_, args, context) => {
    const existingEvent = await findBySlug(args.input.slug)
    if (existingEvent) {
      throw new SlugAlreadyExistsError()
    }
    await create(args.input)
    return await findBySlug(args.input.slug)
  }
}
