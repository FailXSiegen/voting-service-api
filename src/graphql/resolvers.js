import organizerMutations from './resolver/mutation/organizer.js'

export default {
  Query: {
    hello: (_, args, context) => {
      return `Hello ${args.name}`
    }
  },
  Mutation: {
    ...organizerMutations
  }
}
