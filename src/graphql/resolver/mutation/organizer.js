import {
  findOneById,
  remove,
  update
} from '../../../repository/organizer-repository'
import RecordNotFoundError from '../../../errors/RecordNotFoundError'
import { generateAndSetOrganizerHash } from '../../../lib/organizer/optin-util'
// @TODO add two more layers (input validation & data enrichment)

export default {
  updateOrganizer: async (_, args, context) => {
    let existingUser = await findOneById(args.input.id)
    if (!existingUser) {
      throw new RecordNotFoundError()
    }
    await update(args.input)
    return await findOneById(args.input.id)
  },
  deleteOrganizer: async (_, args, context) => {
    throw new Error('Yet not integrated!')
    // const existingUser = await findById(args.id)
    // if (!existingUser) {
    //   throw new RecordNotFoundError()
    // }
    // return await remove(parseInt(args.id))
  }
}
