// import { findOneById, findOneByUsernameAndEventId, update, create, remove } from '../../../repository/event-user-repository'
import { findOneById, update, remove } from '../../../repository/event-user-repository'
import { pubsub } from '../../../index'

export default {
  createEventUser: async (_, args) => {
    const name = (Math.random() + 1).toString(36).substring(7)
    const testUser = {
      id: 123,
      publicName: 'Dummy',
      verified: true,
      allowToVote: true,
      online: true,
      username: name,
      voteAmount: 3,
      eventId: 234
    }
    // const eventUser = await findOneByUsernameAndEventId(args.input.username, args.input.eventId)
    // if (eventUser) {
    //   throw new Error('EventUser already exists')
    // }
    // await create(args.input)
    // const newEventUser = await findOneByUsernameAndEventId(args.input.username, args.input.eventId)
    pubsub.publish('newEventUser', {
      ...testUser
    })

    return testUser
  },
  updateEventUser: async (_, args) => {
    let eventUser = await findOneById(args.input.id)
    if (!eventUser) {
      throw new Error('EventUser not found')
    }
    // await update(args.input)
    eventUser = await findOneById(args.input.id)
    pubsub.publish('updateEventUserAccessRights', {
      eventId: eventUser.eventId,
      eventUserId: eventUser.id,
      verified: eventUser.verified,
      allowToVote: eventUser.allowToVote,
      voteAmount: eventUser.voteAmount
    })
    return eventUser
  },
  updateUserToGuest: async (_, args, { pubsub }) => {
    const eventUser = await findOneById(args.eventUserId)
    if (!eventUser) {
      throw new Error('EventUser not found')
    }

    // Define guest access rights.
    eventUser.verified = true
    eventUser.allowToVote = false
    eventUser.voteAmount = 0
    delete eventUser.password
    await update(eventUser)
    pubsub.publish('updateEventUserAccessRights', {
      updateEventUserAccessRights: {
        eventId: eventUser.eventId,
        eventUserId: eventUser.id,
        verified: eventUser.verified,
        allowToVote: eventUser.allowToVote,
        voteAmount: eventUser.voteAmount
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
    eventUser.voteAmount = 1
    delete eventUser.password
    await update(eventUser)
    pubsub.publish('updateEventUserAccessRights', {
      updateEventUserAccessRights: {
        eventId: eventUser.eventId,
        eventUserId: eventUser.id,
        verified: eventUser.verified,
        allowToVote: eventUser.allowToVote,
        voteAmount: eventUser.voteAmount
      }
    })
    return eventUser
  },
  deleteEventUser: async (_, args, context) => {
    const existingUser = await findOneById(args.eventUserId)
    if (!existingUser) {
      throw new Error('EventUser not found')
    }
    return await remove(parseInt(args.eventUserId))
  }
}
