import eventQueries from './resolver/queries/event'
import eventUserQueries from './resolver/queries/event-user'
import organizerMutations from './resolver/mutation/organizer'
import eventMutations from './resolver/mutation/event'
import eventUserMutations from './resolver/mutation/event-user'
import pollMutations from './resolver/mutation/poll'
import pollResolvers from './resolver/poll/poll'
import eventSubscriptionResolvers from './resolver/subscription/event'

export default {
  Query: {
    ...eventQueries,
    ...eventUserQueries
  },
  Mutation: {
    ...organizerMutations,
    ...eventMutations,
    ...pollMutations,
    ...eventUserMutations
  },
  Poll: {
    ...pollResolvers
  },
  Subscription: {
    ...eventSubscriptionResolvers
  }
}
