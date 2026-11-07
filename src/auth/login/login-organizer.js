import { findOneByUsername } from '../../repository/organizer-repository';
import AuthenticationError from '../../errors/AuthenticationError';
import { verify } from '../../lib/crypto';
import { addRefreshToken } from './refresh-token';
import { signSession } from './session';

export default async function loginOrganizer({ username, password }) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new AuthenticationError();
  }
  const organizer = await findOneByUsername(username);
  // SEC-38: unbekannter Nutzer, nicht freigeschaltet und falsches Passwort sehen gleich aus.
  const passwordIsValid = organizer ? await verify(password, organizer.password) : false;
  if (!organizer || !organizer.verified || !passwordIsValid) {
    throw new AuthenticationError();
  }
  const refreshToken = await addRefreshToken('organizer', organizer.id);
  const { token, decodedToken } = await signSession('organizer', organizer);
  return { token, decodedToken, refreshToken };
}
