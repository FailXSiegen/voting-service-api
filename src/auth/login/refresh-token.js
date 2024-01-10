import { insert, query } from "../../lib/database";
import crypto from "crypto";
import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";

const table = "jwt_refresh_token";

async function generateRefreshTokenHash() {
  return crypto.randomBytes(20).toString("hex");
}

export async function addRefreshToken(type, id) {
  const userField = type === "organizer" ? "organizer_id" : "event_user_id";
  if (id) {
    // Remove existing tokens.
    await query(`DELETE FROM ${table} WHERE ${userField} = ${id}`);
  }
  // Generate, persist and return a new token.
  const token = await generateRefreshTokenHash();
  await insert(table, {
    token,
    organizerId: type === "organizer" ? id : null,
    eventUserId: type === "event-user" ? id : null,
    createDatetime: getCurrentUnixTimeStamp(),
  });
  return token;
}

export async function fetchRefreshToken(token) {
  return await query(`SELECT * FROM ${table} WHERE token = "${token}"`);
}
