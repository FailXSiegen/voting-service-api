import { query, insert, remove as removeQuery } from "./../lib/database";
import { getCurrentUnixTimeStamp } from "../lib/time-stamp";

/**
 * @param {number} eventUserId
 * @returns {object|null}
 */
export async function findOneByEventUserId(eventUserId) {
  const result = await query(
    "SELECT * FROM event_user_auth_token WHERE event_user_id = ?",
    [eventUserId],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

/**
 * @param {string} token
 * @returns {object|null}
 */
export async function findOneByToken(token) {
  const result = await query(
    "SELECT * FROM event_user_auth_token WHERE token = ? AND active = ?",
    [token, true],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

/**
 * @param {string} token
 * @returns {object|null}
 */
export async function findOneInactiveByToken(token) {
  const result = await query(
    "SELECT * FROM event_user_auth_token WHERE token = ? AND active = ?",
    [token, false],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

/**
 * @param {string} token
 * @param {number} eventUserId
 * @return {number|null}
 */
export async function create(token, eventUserId) {
  return await insert("event_user_auth_token", {
    token,
    eventUserId,
    createDatetime: getCurrentUnixTimeStamp(),
    active: false,
  });
}

/**
 * @param {string} token
 * @param {string} newToken
 */
export async function activate(token, newToken) {
  await query(
    "UPDATE event_user_auth_token SET active = ?, token = ? WHERE token = ?",
    [true, newToken, token],
  );
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export async function remove(id) {
  return removeQuery("event_user_auth_token", id);
}
