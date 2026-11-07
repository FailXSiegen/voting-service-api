import { verifyJwt } from '../lib/jwt-auth';
import { findOneById as findOrganizerById } from '../repository/organizer-repository';
import { findOneById as findEventUserById } from '../repository/event-user-repository';
import { fetchRefreshToken } from './login/refresh-token';

const bearer = (value) =>
  typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : null;

// Verifizierter JWT -> Nutzer mit Daten aus der DB (eventId nie aus dem Token übernehmen).
// Gibt null zurück, wenn Token ungültig ist oder der Nutzer nicht mehr existiert.
async function userFromToken(token) {
  if (!token) return null;
  let decoded;
  try {
    decoded = await verifyJwt(token);
  } catch (error) {
    return null;
  }
  const claims = decoded?.user;
  if (!claims?.id) return null;
  return loadUser(claims.type, claims.id, claims);
}

async function loadUser(type, id, claims = {}) {
  if (type === 'organizer') {
    const organizer = await findOrganizerById(id);
    if (!organizer) return null;
    delete organizer.password;
    delete organizer.hash;
    return { ...claims, id: organizer.id, type, organizer };
  }
  if (type === 'event-user') {
    const eventUser = await findEventUserById(id);
    if (!eventUser) return null;
    delete eventUser.password;
    return {
      ...claims,
      id: eventUser.id,
      type,
      eventId: eventUser.eventId,
      verified: Boolean(eventUser.verified),
      eventUser,
    };
  }
  return null;
}

export const userFromAuthHeader = (header) => userFromToken(bearer(header));

// Für öffentliche REST-Routen, die eingeloggten Nutzern mehr zeigen (z. B. Meeting-Zugangsdaten):
// Bearer-Token oder signiertes Refresh-Cookie.
export async function optionalUser(req) {
  const fromHeader = await userFromAuthHeader(req.headers.authorization);
  if (fromHeader) return fromHeader;
  const refreshToken = req.signedCookies?.refreshToken;
  if (!refreshToken) return null;
  const record = await fetchRefreshToken(refreshToken);
  if (!record) return null;
  return record.organizerId
    ? loadUser('organizer', record.organizerId)
    : loadUser('event-user', record.eventUserId);
}
