// import { withFilter } from 'graphql-subscriptions'

export default {
  pollLifeCycle: {
    // subscribe: withFilter(
    //   (parent, { eventId }, { pubsub }) => pubsub.asyncIterator('pollLifeCycle'),
    //   (payload, variables) => {
    //     if (!variables.eventId) {
    //       return true
    //     }
    //     return parseInt(payload.pollLifeCycle.eventId) === parseInt(variables.eventId)
    //   }
    // )
  }
}
