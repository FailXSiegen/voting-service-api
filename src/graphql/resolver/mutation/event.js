import { create, findOneBySlug } from '../../../repository/event-repository'
import SlugAlreadyExistsError
  from '../../../errors/event/SlugAlreadyExistsError'

export default {
  createEvent: async (_, args, context) => {
    const existingEvent = await findOneBySlug(args.input.slug)
    console.log(existingEvent)
    if (existingEvent) {
      throw new SlugAlreadyExistsError()
    }
    await create(args.input)
    return await findOneBySlug(args.input.slug)
  }
}
