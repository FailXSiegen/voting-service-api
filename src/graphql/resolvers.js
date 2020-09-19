import eventQueries from './resolver/queries/event'
import organizerMutations from './resolver/mutation/organizer'
import eventMutations from './resolver/mutation/event'
import eventUserMutations from './resolver/mutation/eventUser'
import pollMutations from './resolver/mutation/poll'
import pollResolvers from './resolver/poll/poll'

export default {
  Query: {
    ...eventQueries
  },
  Mutation: {
    ...organizerMutations,
    ...eventMutations,
    ...pollMutations,
    ...eventUserMutations
  },
  Poll: {
    ...pollResolvers
  }
}
