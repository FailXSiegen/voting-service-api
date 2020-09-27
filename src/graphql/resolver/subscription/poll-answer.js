export default {
  pollAnswerLifeCycle: {
    // @TODO add filter
    subscribe (parent, args, { pubsub }) {
      return pubsub.asyncIterator('pollAnswerLifeCycle')
    }
  }
}
