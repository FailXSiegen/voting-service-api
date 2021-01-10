import { findOneByUsername } from '../../repository/organizer-repository'
import AuthenticationError from '../../errors/AuthenticationError'
import { generateJwt } from '../../lib/jwt-auth'
import * as jwt from 'jsonwebtoken'
import { addRefreshToken } from './refresh-token'
import { verify, hash } from '../../lib/crypto'

export default async function loginOrganizer ({ username, password }) {
  // Fetch organizer record.
  const organizer = await findOneByUsername(username)
  if (!organizer || !organizer.verified) {
    throw new Error('Could not find organizer with the following email: ' + username)
  }
  // Verify password.
  const isAuthenticated = await verify(password, organizer.password)
  if (!isAuthenticated) {
    console.log('Does not match: ' + await hash(password))
    throw new AuthenticationError()
  }
  // Create jwt and refresh token.
  const refreshToken = await addRefreshToken('organizer', organizer.id)
  const claims = { user: { id: organizer.id, type: 'organizer' }, role: 'organizer' }
  const token = await generateJwt(claims)
  const decodedToken = await jwt.verify(token, process.env.JWT_SECRET)
  return { token, decodedToken, refreshToken }
}
