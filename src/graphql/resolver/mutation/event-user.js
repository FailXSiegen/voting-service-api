import { findOneById, update } from '../../../repository/event-user-repository'

export default {
  updateEventUser: async (_, args, context) => {
    const eventUser = await findOneById(args.input.id)
    if (!eventUser) {
      throw new Error('EventUser not found')
    }
    await update(args.input)
    return await findOneById(args.input.id)
  },
  updateUserToGuest: async (_, args, { pubsub }) => {
    const eventUser = await findOneById(args.eventUserId)
    console.log(eventUser)
    if (!eventUser) {
      throw new Error('EventUser not found')
    }

    // Define guest access rights.
    eventUser.verified = true
    eventUser.allowToVote = false

    delete eventUser.password
    await update(eventUser)
    pubsub.publish('updateEventUserAccessRights', {
      updateEventUserAccessRights: {
        eventUserId: eventUser.id,
        verified: eventUser.verified,
        allowToVote: eventUser.allowToVote
      }
    })
    return eventUser
  },
  updateUserToParticipant: async (_, args, { pubsub }) => {
    const eventUser = await findOneById(args.eventUserId)
    if (!eventUser) {
      throw new Error('EventUser not found')
    }
    // Define participant access rights.
    eventUser.verified = true
    eventUser.allowToVote = true

    delete eventUser.password
    await update(eventUser)
    pubsub.publish('updateEventUserAccessRights', {
      updateEventUserAccessRights: {
        eventUserId: eventUser.id,
        verified: eventUser.verified,
        allowToVote: eventUser.allowToVote
      }
    })
    return eventUser
  }
}
