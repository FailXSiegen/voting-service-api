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

async function buildNewEventUserObject (username, password, email, displayName, eventId) {
  return {
    username,
    password,
    email: typeof email === 'string' ? email : '',
    publicName: displayName,
    allowToVote: false,
    online: false,
    coorganizer: false,
    verified: false,
    eventId
  }
}

export default async function loginEventUser ({ username, password, email, displayName, eventId }) {
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
  } else {
    // Verify password.
    const isAuthenticated = await verify(password, eventUser.password)
    if (!isAuthenticated) {
      throw new AuthenticationError()
    }
    if (eventUser.publicName !== displayName) {
      // Update display name.
      eventUser.publicName = displayName
      delete eventUser.password
      await update(eventUser)
    }
  }
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
}
