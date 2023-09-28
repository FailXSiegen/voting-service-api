import {
  findOneByUsernameAndEventId,
  findOneById,
  create,
  update
} from '../../repository/event-user-repository'
import { generateJwt } from '../../lib/jwt-auth'
import * as jwt from 'jsonwebtoken'
import { addRefreshToken } from './refresh-token'
import { verify } from '../../lib/crypto'
import AuthenticationError from '../../errors/AuthenticationError'
import { eventIsActive } from '../../repository/event-repository'
import { pubsub } from '../../server/graphql'
import { EVENT_USER_LIFE_CYCLE, NEW_EVENT_USER } from '../../graphql/resolver/subscription/subscription-types'

async function buildNewEventUserObject (username, password, email, displayName, eventId) {
  return {
    username,
    password,
    email: typeof email === 'string' ? email : '',
    publicName: displayName,
    allowToVote: false,
    online: true,
    coorganizer: false,
    verified: false,
    eventId
  }
}

export default async function loginEventUser ({ username, password, email, displayName, eventId }) {
  if (await eventIsActive(eventId)) {
    username = username.trim()
    let eventUser = await findOneByUsernameAndEventId(username, eventId)
    if (!eventUser) {
      // create new event user.
      const newEventUserId = await create(
        await buildNewEventUserObject(username, password, email, displayName, eventId)
      )
      // Fetch newly created event user.
      eventUser = await findOneById(newEventUserId)
      if (eventUser === null) {
        throw new Error('Could not create new user!')
      }

      // Notify subscribers for new event user.
      pubsub.publish(NEW_EVENT_USER, {
        ...eventUser
      })
    } else {
      let isAuthenticated = false
      if (eventUser.password === '') {
        const eventUserPasswordUpdate = {
          id: eventUser.id,
          password: password
        }
        await update(eventUserPasswordUpdate)
        isAuthenticated = true
      } else {
        // Verify password.
        isAuthenticated = await verify(password, eventUser.password)
      }
      if (!isAuthenticated) {
        throw new AuthenticationError()
      }
      if (eventUser.publicName !== displayName) {
        // Update display name.
        eventUser.publicName = displayName
        delete eventUser.password
        await update(eventUser)
      }

      // Notify subscribers for updated event user.
      pubsub.publish(EVENT_USER_LIFE_CYCLE, {
        online: true,
        eventUserId: eventUser.id
      })
    }

    // Update user as online.
    await update({ id: eventUser.id, online: true })

    // Create jwt and refresh token.
    const refreshToken = await addRefreshToken('event-user', eventUser.id)
    const claims = {
      user: {
        id: eventUser.id,
        type: 'event-user',
        verified: eventUser.verified
      },
      role: 'event-user'
    }
    const token = await generateJwt(claims)
    const decodedToken = await jwt.verify(token, process.env.JWT_SECRET)
    return { token, decodedToken, refreshToken }
  } else {
    throw new Error('Event is not available!')
  }
}
