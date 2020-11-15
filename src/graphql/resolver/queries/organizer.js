import { findOrganizers } from '../../../repository/organizer-repository'

export default {
  organizers: async (_, args, context) => {
    return await findOrganizers()
  }
}
