import { findOneByEmail } from '../../repository/organizer-repository'
import bcrypt from 'bcrypt'
import AuthenticationError from '../../errors/AuthenticationError'
import { generateJwt } from '../../lib/jwt-auth'
import * as jwt from 'jsonwebtoken'
import { addRefreshToken } from './refresh-token'

export default async function loginOrganizer ({ username, password }) {
  const organizer = await findOneByEmail(username)
  if (!organizer) {
    throw new Error('Could not find organizer with the following email: ' + username)
  }
  const isAuthenticated = await bcrypt.compare(password, organizer.password)
  if (!isAuthenticated) {
    throw new AuthenticationError()
  }
  const refreshToken = await addRefreshToken('organizer', organizer.id)
  const claims = { user: { id: organizer.id, type: 'organizer' }, role: 'organizer' }
  const token = await generateJwt(claims)
  const decodedToken = await jwt.verify(token, process.env.JWT_SECRET)

  return { token, decodedToken, refreshToken }
}
