import { pubsub } from '../../../index'
import { filter, pipe } from '@graphql-yoga/node'

export default {
  updateEventUserAccessRights: {
    subscribe: (_, args) =>
      pipe(
        pubsub.subscribe('updateEventUserAccessRights'),
        filter((payload) => {
          if (!args.eventUserId) {
            return true // Allow organizers to get notified without eventUserId variable.
          }
          return parseInt(payload.eventUserId) === parseInt(args.eventUserId)
        })
      ),
    resolve: (payload) => payload
  },
  newEventUser: {
    subscribe: () => {
      return pubsub.subscribe('newEventUser')
    },
    resolve: (payload) => payload
  },
  eventUserLifeCycle: {
    // @TODO add filter
    subscribe (parent, args, { pubsub }) {
      return pubsub.asyncIterator('eventUserLifeCycle')
    }
  }
}
