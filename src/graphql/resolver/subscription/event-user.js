import { withFilter } from 'graphql-subscriptions'

export default {
  updateEventUserAccessRights: {
    subscribe: withFilter(
      (parent, { eventId }, { pubsub }) => pubsub.asyncIterator('updateEventUserAccessRights'),
      (payload, variables) => {
        return payload.updateEventUserAccessRights.eventUserId === parseInt(variables.eventUserId)
      }
    )
  },
  newEventUser: {
    subscribe (parent, args, { pubsub }) {
      return pubsub.asyncIterator('newEventUser')
    }
  }
}
