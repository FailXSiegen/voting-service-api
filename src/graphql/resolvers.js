import eventQueries from './resolver/queries/event'
import organizerMutations from './resolver/mutation/organizer.js'
import eventMutations from './resolver/mutation/event'
import pollMutations from './resolver/mutation/poll'
import pollResolvers from './resolver/poll/poll'

export default {
  Query: {
    ...eventQueries
  },
  Mutation: {
    ...organizerMutations,
    ...eventMutations,
    ...pollMutations
  },
  Poll: {
    ...pollResolvers
  }
}
