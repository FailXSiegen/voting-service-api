import crypto from 'crypto';
import { getCurrentUnixTimeStamp } from '../time-stamp';
import { findOneByTokenHash, update } from '../../repository/organizer-repository';

// SEC-10: zufällige Tokens, in der DB nur der SHA-256, getrennt nach Zweck, mit Ablauf, einmalig.
export const TOKEN_PURPOSE = {
  OPTIN: { column: 'optinToken', ttl: 7 * 24 * 60 * 60 }, // Bestätigungsmail: 7 Tage
  RESET: { column: 'resetToken', ttl: 30 * 60 }, // Passwort-Reset: 30 Minuten
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isTokenFormat = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

export async function issueOrganizerToken(organizerId, purpose) {
  const token = crypto.randomBytes(32).toString('hex');
  await update({
    id: organizerId,
    [`${purpose.column}Hash`]: sha256(token),
    [`${purpose.column}Expires`]: getCurrentUnixTimeStamp() + purpose.ttl,
  });
  return token;
}

// Organizer zum gültigen Token oder null. Prüft nur, verbraucht nicht.
export async function findOrganizerByToken(token, purpose) {
  if (!isTokenFormat(token)) return null;
  const organizer = await findOneByTokenHash(purpose.column, sha256(token));
  if (!organizer || organizer[`${purpose.column}Expires`] < getCurrentUnixTimeStamp()) return null;
  return organizer;
}

export const consumeTokenFields = (purpose) => ({
  [`${purpose.column}Hash`]: null,
  [`${purpose.column}Expires`]: null,
});
