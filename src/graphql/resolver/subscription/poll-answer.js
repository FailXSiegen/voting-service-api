import { pubsub } from '../../../index'
import { filter, pipe } from '@graphql-yoga/node'
import { POLL_ANSWER_LIFE_CYCLE } from './subscription-types'

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
