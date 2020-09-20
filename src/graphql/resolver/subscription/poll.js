export default {
  pollLifeCycle: {
    subscribe (parent, args, { pubsub }) {
      return pubsub.asyncIterator('pollLifeCycle')
    }
  }
}
