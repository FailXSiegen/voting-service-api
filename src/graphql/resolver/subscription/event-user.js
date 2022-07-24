import { pubsub } from '../../../server/graphql'
import { filter, pipe } from '@graphql-yoga/node'
import { UPDATE_EVENT_USER_ACCESS_RIGHTS, NEW_EVENT_USER, EVENT_USER_LIFE_CYCLE } from './subscription-types'

export default {
  [UPDATE_EVENT_USER_ACCESS_RIGHTS]: {
    subscribe: (_, args) => pipe(
      pubsub.subscribe(UPDATE_EVENT_USER_ACCESS_RIGHTS),
      filter((payload) => {
        if (!args.eventUserId) {
          return true // Allow organizers to get notified without eventUserId variable.
        }
        return parseInt(payload.eventUserId) === parseInt(args.eventUserId)
      })
    ),
    resolve: (payload) => payload
  },
  [NEW_EVENT_USER]: {
    subscribe: () => {
      return pubsub.subscribe(NEW_EVENT_USER)
    },
    resolve: (payload) => payload
  },
  [EVENT_USER_LIFE_CYCLE]: {
    subscribe: async function* (_) {
      return pubsub.asyncIterator(EVENT_USER_LIFE_CYCLE)
    },
    resolve: (payload) => payload
  }
}
