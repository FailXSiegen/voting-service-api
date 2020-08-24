// import {
//   create,
//   findById,
//   findOneByEmail,
//   remove,
//   update
// } from '../../../repository/organizer-repository'
// import EmailAlreadyExistsError from '../../../errors/EmailAlreadyExistsError'
// import RecordNotFoundError from '../../../errors/RecordNotFoundError'

// @TODO add two more layers (input validation & data enrichment)

export default {
  createOrganizer: async (_, args, context) => {
    throw new Error('Yet not integrated!')
    // const existingUser = await findOneByEmail(args.input.email)
    // if (existingUser) {
    //   throw new EmailAlreadyExistsError()
    // }
    // await create(args.input)
    // return await findOneByEmail(args.input.email)
  },
  updateOrganizer: async (_, args, context) => {
    throw new Error('Yet not integrated!')
    // let existingUser = await findById(args.input.id)
    // if (!existingUser) {
    //   throw new RecordNotFoundError()
    // }
    // if (args.input.email) {
    //   existingUser = await findOneByEmail(args.input.email)
    //   if (existingUser) {
    //     throw new EmailAlreadyExistsError()
    //   }
    // }
    // await update(args.input)
    // return await findById(args.input.id)
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
