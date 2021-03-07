import { findOneByUsername } from '../../repository/organizer-repository'
import { verify, hash } from '../../lib/crypto'

export default async function verifyPassword (username, password) {
  const organizer = await findOneByUsername(username)
  if (!organizer || !organizer.verified) {
    throw new Error('Could not find organizer with the following email or is not yet verified: ' + username)
  }
  const isAuthenticated = await verify(password, organizer.password)
  if (!isAuthenticated) {
    console.log('Does not match: ' + await hash(password))
    return false
  }
  return true
}
