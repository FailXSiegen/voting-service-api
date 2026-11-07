import { findOneByUsername } from '../../repository/organizer-repository';
import { verify } from '../../lib/crypto';

export default async function verifyPassword(username, password) {
  const organizer = await findOneByUsername(username);
  if (!organizer || !organizer.verified) {
    return false;
  }
  return verify(password, organizer.password);
}
