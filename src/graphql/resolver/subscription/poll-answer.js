// import { withFilter } from 'graphql-subscriptions'

export default {
  pollAnswerLifeCycle: {
    // subscribe: withFilter(
    //   (parent, { eventId }, { pubsub }) => pubsub.asyncIterator('pollAnswerLifeCycle'),
    //   (payload, variables) => {
    //     if (!variables.eventId) {
    //       return true
    //     }
    //     return parseInt(payload.pollAnswerLifeCycle.eventId) === parseInt(variables.eventId)
    //   }
    // )
  }
}
