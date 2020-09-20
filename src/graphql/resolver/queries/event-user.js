import { findOneById } from '../../../repository/event-user-repository'

export default {
  eventUser: async (_, args, context) => {
    return await findOneById(args.id)
  }
}
