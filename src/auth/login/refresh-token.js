import { insert, query } from '../../lib/database';
import crypto from 'crypto';
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp';
import { REFRESH_COOKIE_MAX_AGE } from '../../server/security';

const table = 'jwt_refresh_token';

export async function addRefreshToken(type, id) {
  // SEC-14: nur Platzhalter, feste Spaltennamen.
  const userField = type === 'organizer' ? 'organizer_id' : 'event_user_id';
  if (id) {
    // Remove existing tokens.
    await query(`DELETE FROM ${table} WHERE ${userField} = ?`, [id]);
  }
  // Generate, persist and return a new token.
  const token = crypto.randomBytes(32).toString('hex');
  await insert(table, {
    token,
    organizerId: type === 'organizer' ? id : null,
    eventUserId: type === 'event-user' ? id : null,
    createDatetime: getCurrentUnixTimeStamp(),
  });
  return token;
}

// Ein Datensatz oder null. Abgelaufene Tokens (älter als das Cookie) gelten nicht.
export async function fetchRefreshToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{40,64}$/.test(token)) return null;
  const minCreated = getCurrentUnixTimeStamp() - REFRESH_COOKIE_MAX_AGE / 1000;
  const rows = await query(`SELECT * FROM ${table} WHERE token = ? AND create_datetime >= ?`, [
    token,
    minCreated,
  ]);
  return Array.isArray(rows) ? rows[0] || null : null;
}
