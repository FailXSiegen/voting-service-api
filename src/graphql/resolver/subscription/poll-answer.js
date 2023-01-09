import { filter, pipe } from 'graphql-yoga'
import { POLL_ANSWER_LIFE_CYCLE } from './subscription-types'
import { pubsub } from '../../../server/graphql'

export default {
  [POLL_ANSWER_LIFE_CYCLE]: {
    subscribe: (_, args) => pipe(
      pubsub.subscribe(POLL_ANSWER_LIFE_CYCLE),
      filter((payload) => {
        if (!args.eventId) {
          return true
        }
        return parseInt(payload.eventId) === parseInt(args.eventId)
      })
    ),
    resolve: (payload) => payload
  }
}
