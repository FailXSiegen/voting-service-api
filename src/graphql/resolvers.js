import organizerMutations from './resolver/mutation/organizer.js'
import eventMutations from './resolver/mutation/event'
export default {
  Query: {
    hello: (_, args, context) => {
      return `Hello ${args.name}`
    }
  },
  Mutation: {
    ...organizerMutations,
    ...eventMutations
  }
}
