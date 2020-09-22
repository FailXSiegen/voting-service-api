import eventQueries from './resolver/queries/event'
import eventUserQueries from './resolver/queries/event-user'
import pollQueries from './resolver/queries/poll'
import organizerMutations from './resolver/mutation/organizer'
import eventMutations from './resolver/mutation/event'
import eventUserMutations from './resolver/mutation/event-user'
import pollMutations from './resolver/mutation/poll'
import pollResolvers from './resolver/poll/poll'
import pollSubscriptionResolvers from './resolver/subscription/poll'
import eventUserSubscriptionResolvers from './resolver/subscription/event-user'

export default {
  Query: {
    ...eventQueries,
    ...eventUserQueries,
    ...pollQueries
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
    ...pollSubscriptionResolvers,
    ...eventUserSubscriptionResolvers
  }
}
