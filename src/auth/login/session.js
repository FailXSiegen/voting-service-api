import * as jwt from 'jsonwebtoken';
import { generateJwt } from '../../lib/jwt-auth';
import { refreshCookieOptions } from '../../server/security';

// Dieselben Claims wie beim Passwort-Login, damit Refresh und Token-Login gleichwertige JWTs liefern.
function claimsFor(type, record) {
  if (type === 'organizer') {
    return { user: { id: record.id, type }, role: type, organizerId: record.id };
  }
  return {
    user: { id: record.id, eventId: record.eventId, type, verified: Boolean(record.verified) },
    role: type,
    eventUserId: record.id,
  };
}

export async function signSession(type, record) {
  const token = await generateJwt(claimsFor(type, record));
  const decodedToken = jwt.decode(token);
  return { token, decodedToken };
}

export function setRefreshCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
}
