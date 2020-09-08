import eventQueries from './resolver/queries/event'
import organizerMutations from './resolver/mutation/organizer.js'
import eventMutations from './resolver/mutation/event'

export default {
  Query: {
    ...eventQueries
  },
  Mutation: {
    ...organizerMutations,
    ...eventMutations
  }
}
