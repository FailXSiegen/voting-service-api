import {
  create,
  findOneById,
  findOneByUsername,
  remove,
  update
} from '../../../repository/organizer-repository'
import EmailAlreadyExistsError from '../../../errors/EmailAlreadyExistsError'
import RecordNotFoundError from '../../../errors/RecordNotFoundError'
import { generateAndSetOrganizerHash } from '../../../lib/organizer/optin-util'
// @TODO add two more layers (input validation & data enrichment)

export default {
  createOrganizer: async (_, args, context) => {
    const existingUser = await findOneByUsername(args.input.username)
    if (existingUser) {
      throw new EmailAlreadyExistsError()
    }
    await create(args.input)
    let organizer =  await findOneByUsername(args.input.username)
    await generateAndSetOrganizerHash(organizer)
    // @Todo Sendmail?
    return organizer
  },
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
