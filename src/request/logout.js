import { extractCookieValueByHeader } from "../lib/cookie-from-string-util";
import { query } from "../lib/database";
import { pubsub } from "../server/graphql";
import { EVENT_USER_LIFE_CYCLE } from "../graphql/resolver/subscription/subscription-types";
import { findOneById as findEventUserById } from "../repository/event-user-repository";

export default async function logoutRequest(req, res) {
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    console.log('[DEBUG] logout.js - Processing logout request');
  }
  
  const token = extractCookieValueByHeader(req.headers.cookie, "refreshToken");
  if (typeof token !== "string" || token.length === 0) {
    if (isDev) {
      console.log('[DEBUG] logout.js - No refresh token found in cookies');
    }
    res.send(
      JSON.stringify({
        success: false,
      }),
    );
    return;
  }
  
  if (isDev) {
    console.log('[DEBUG] logout.js - Found refresh token, looking up user');
  }
  
  const result = await query(
    "SELECT event_user_id FROM jwt_refresh_token WHERE token = ?",
    [token],
  );
  const tokenRecord = Array.isArray(result) ? result[0] || null : null;
  
  if (tokenRecord && tokenRecord.eventUserId && tokenRecord.eventUserId > 0) {
    if (isDev) {
      console.log('[DEBUG] logout.js - Setting user offline:', tokenRecord.eventUserId);
    }
    
    await query("UPDATE event_user SET online = ? WHERE id = ?", [
      false,
      tokenRecord.eventUserId,
    ]);
    
    // Fetch the event user to get the event ID
    const eventUser = await findEventUserById(tokenRecord.eventUserId);

    if (isDev) {
      console.log('[DEBUG] logout.js - Event user lookup result:', {
        eventUser,
        eventId: eventUser ? eventUser.eventId : null
      });
    }

    const eventId = eventUser ? eventUser.eventId : null;
    
    if (isDev) {
      console.log('[DEBUG] logout.js - Publishing EVENT_USER_LIFE_CYCLE event:', {
        online: false,
        eventUserId: tokenRecord.eventUserId,
        eventId
      });
    }

    pubsub.publish(EVENT_USER_LIFE_CYCLE, {
      online: false,
      eventUserId: tokenRecord.eventUserId,
      eventId
    });
    
    await query("DELETE FROM event_user_auth_token WHERE event_user_id = ?", [
      tokenRecord.eventUserId,
    ]);
  } else {
    if (isDev) {
      console.log('[DEBUG] logout.js - No valid token record found');
    }
  }
  
  await query("DELETE FROM jwt_refresh_token WHERE token = ?", [token]);

  res.clearCookie("refreshToken");
  res.clearCookie("eventUserAuthToken");

  if (isDev) {
    console.log('[DEBUG] logout.js - Logout completed successfully');
  }

  res.send(
    JSON.stringify({
      success: true,
    }),
  );
}
