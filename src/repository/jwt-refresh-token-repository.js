import { query } from "./../lib/database";

/**
 * @param {string} token
 * @returns {object|null}
 */
export async function findOneByRefreshToken(token) {
  const result = await query(
    "SELECT * FROM jwt_refresh_token WHERE token = ?",
    [token],
  );
  return Array.isArray(result) ? result[0] || null : null;
}
