import eventQueries from './resolver/queries/event'
import eventUserQueries from './resolver/queries/event-user'
import pollQueries from './resolver/queries/poll'
import pollResultQueries from './resolver/queries/poll-result'
import organizerMutations from './resolver/mutation/organizer'
import eventMutations from './resolver/mutation/event'
import eventUserMutations from './resolver/mutation/event-user'
import pollMutations from './resolver/mutation/poll'
import pollAnswerMutations from './resolver/mutation/poll-answer'
import pollUserVotedMutations from './resolver/mutation/poll-user-voted'
import activePollEventUser from './resolver/active-poll-event-user/active-poll-event-user'
import pollResolvers from './resolver/poll/poll'
import pollResultResolvers from './resolver/poll-result/poll-result'
import pollSubscriptionResolvers from './resolver/subscription/poll'
import eventUserSubscriptionResolvers from './resolver/subscription/event-user'
import poolAnswerSubscriptionResolvers
  from './resolver/subscription/poll-answer'

export default {
  Query: {
    ...eventQueries,
    ...eventUserQueries,
    ...pollQueries,
    ...pollResultQueries
  },
  Mutation: {
    ...organizerMutations,
    ...eventMutations,
    ...pollMutations,
    ...pollAnswerMutations,
    ...eventUserMutations,
    ...pollUserVotedMutations
  },
  ActivePollEventUser: {
    ...activePollEventUser
  },
  Poll: {
    ...pollResolvers
  },
  PollResult: {
    ...pollResultResolvers
  },
  Subscription: {
    ...pollSubscriptionResolvers,
    ...eventUserSubscriptionResolvers,
    ...poolAnswerSubscriptionResolvers
  }
}
