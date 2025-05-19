import { extractCookieValueByHeader } from "../lib/cookie-from-string-util";
import { query } from "../lib/database";
import { pubsub } from "../server/graphql";
import { EVENT_USER_LIFE_CYCLE } from "../graphql/resolver/subscription/subscription-types";

export default async function logoutRequest(req, res) {
  const token = extractCookieValueByHeader(req.headers.cookie, "refreshToken");
  if (typeof token !== "string" || token.length === 0) {
    res.send(
      JSON.stringify({
        success: false,
      }),
    );
    return;
  }
  const result = await query(
    "SELECT event_user_id FROM jwt_refresh_token WHERE token = ?",
    [token],
  );
  const tokenRecord = Array.isArray(result) ? result[0] || null : null;
  if (tokenRecord && tokenRecord.eventUserId && tokenRecord.eventUserId > 0) {
    await query("UPDATE event_user SET online = ? WHERE id = ?", [
      false,
      tokenRecord.eventUserId,
    ]);
    // Fetch the event user to get the event ID
    const eventUserResult = await query(
      "SELECT id, event_id FROM event_user WHERE id = ?",
      [tokenRecord.eventUserId]
    );
    const eventUser = Array.isArray(eventUserResult) ? eventUserResult[0] || null : null;

    pubsub.publish(EVENT_USER_LIFE_CYCLE, {
      online: false,
      eventUserId: tokenRecord.eventUserId,
      eventId: eventUser ? eventUser.event_id : null
    });
    await query("DELETE FROM event_user_auth_token WHERE event_user_id = ?", [
      tokenRecord.eventUserId,
    ]);
  }
  await query("DELETE FROM jwt_refresh_token WHERE token = ?", [token]);

  res.clearCookie("refreshToken");
  res.clearCookie("eventUserAuthToken");

  res.send(
    JSON.stringify({
      success: true,
    }),
  );
}
