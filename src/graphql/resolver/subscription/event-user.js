import { withFilter } from 'graphql-subscriptions'

export default {
  updateEventUserAccessRights: {
    subscribe: withFilter(
      (parent, { eventId }, { pubsub }) => pubsub.asyncIterator('updateEventUserAccessRights'),
      (payload, variables) => {
        if (!variables.eventUserId) {
          return true // Allow organizers to get notified without eventUserId variable.
        }
        return payload.updateEventUserAccessRights.eventUserId === parseInt(variables.eventUserId)
      }
    )
  },
  newEventUser: {
    subscribe (parent, args, { pubsub }) {
      return pubsub.asyncIterator('newEventUser')
    }
  },
  eventUserLifeCycle: {
    // @TODO add filter
    subscribe (parent, args, { pubsub }) {
      return pubsub.asyncIterator('eventUserLifeCycle')
    }
  }
}
