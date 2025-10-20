import { query, insert, baseQuery } from "./../lib/database";
import { getCurrentUnixTimeStamp } from "../lib/time-stamp";

/**
 * @param {string} shortCode
 * @returns {object|null}
 */
export async function findOneByShortCode(shortCode) {
  const result = await query(
    "SELECT * FROM event_user_shortlink WHERE short_code = ?",
    [shortCode],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

/**
 * @param {number} eventUserId
 * @returns {object|null}
 */
export async function findByEventUserId(eventUserId) {
  const result = await query(
    "SELECT * FROM event_user_shortlink WHERE event_user_id = ?",
    [eventUserId],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

/**
 * @param {number} eventUserId
 * @param {number} eventId
 * @param {string} shortCode
 * @return {number|null}
 */
export async function create(eventUserId, eventId, shortCode) {
  return await insert("event_user_shortlink", {
    eventUserId,
    eventId,
    shortCode,
    createDatetime: getCurrentUnixTimeStamp(),
  });
}

/**
 * Get all event users with their shortlinks for a specific event
 * @param {number} eventId
 * @returns {array}
 */
export async function findEventUsersWithShortlinks(eventId) {
  const result = await query(
    `SELECT
      eu.id,
      eu.event_id,
      eu.username,
      eu.email,
      eu.public_name,
      eu.allow_to_vote,
      eu.vote_amount,
      eu.online,
      eu.coorganizer,
      eu.verified,
      eu.last_activity,
      eus.short_code
    FROM event_user eu
    LEFT JOIN event_user_shortlink eus ON eu.id = eus.event_user_id AND eus.event_id = ?
    WHERE eu.event_id = ? AND eu.verified = 1`,
    [eventId, eventId],
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Delete all shortlinks for a specific event
 * @param {number} eventId
 * @returns {Promise<boolean>}
 */
export async function deleteAllByEventId(eventId) {
  const result = await baseQuery(
    "DELETE FROM event_user_shortlink WHERE event_id = ?",
    [eventId],
  );
  return result !== null;
}
