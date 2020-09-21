export default {
  newEventUser: {
    subscribe (parent, args, { pubsub }) {
      return pubsub.asyncIterator('newEventUser')
    }
  }
}
