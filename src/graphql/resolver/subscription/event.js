export default {
  updateEventUserAccessRights: {
    subscribe (parent, args, { pubsub }) {
      return pubsub.asyncIterator('updateEventUserAccessRights')
    }
  }
}
