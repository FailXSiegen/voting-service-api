import {
  query,
  insert,
  update as updateQuery,
  remove as removeQuery,
} from "./../lib/database";
import { hash } from "../lib/crypto";
import { getCurrentUnixTimeStamp } from "../lib/time-stamp";
import { createPollUserIfNeeded } from "../service/poll-service";
import { findActivePoll } from "./poll/poll-result-repository";

export async function findOneById(id) {
  const result = await query("SELECT * FROM event_user WHERE id = ?", [id]);
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findOneByUsernameAndEventId(username, eventId) {
  const result = await query(
    "SELECT event_user.* FROM event_user INNER JOIN event ON event_user.event_id = event.id WHERE event_user.username = ? AND event.id = ? AND event.deleted = 0",
    [username, eventId],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findEventUserByEventId(eventId) {
  return await query(
    "SELECT * FROM event_user WHERE event_id = ? ORDER BY online DESC, public_name ASC",
    [eventId],
  );
}

export async function findVotableEventUserByEventId(eventId) {
  return await query(
    "SELECT * FROM event_user WHERE event_id = ? AND verified = 1 AND allow_to_vote = 1 ORDER BY public_name ASC",
    [eventId],
  );
}

export async function findOnlineEventUserByEventId(eventId) {
  return await query(
    "SELECT * FROM event_user WHERE event_id = ? AND verified = 1 AND online = 1 AND allow_to_vote = 1 ORDER BY public_name ASC",
    [eventId],
  );
}

/**
 * Neue Direktmethode zum Aktualisieren des Online-Status eines Benutzers ohne Refresh-Token
 * Diese Funktion wird für die JWT-Auth in WebSockets verwendet
 */
export async function updateEventUserOnlineState(eventUserId, online) {
  // Timestamp für den letzten Aktivitätszeitpunkt
  const timestamp = getCurrentUnixTimeStamp();

  try {
    // Find the event user first to check if it exists and to get the event_id and current status
    const eventUserResult = await query("SELECT id, event_id, online FROM event_user WHERE id = ?", [eventUserId]);
    const eventUser = eventUserResult[0];

    if (!eventUser) {
      console.warn(`[WARN] Event-User mit ID ${eventUserId} nicht gefunden`);
      return false;
    }


    // Prüfe, ob sich der Status tatsächlich ändert (0/1 in MySQL zu boolean)
    const currentOnline = eventUser.online == 1;

    // Update the online status - nur wenn sich der Status ändert oder es ein Aktivitätsupdate ist
    const sql = `
      UPDATE event_user
      SET event_user.online = ?, event_user.last_activity = ?
      WHERE event_user.id = ?
    `;
    await query(sql, [online, timestamp, eventUserId]);

    // Wichtig: PubSub Event nur auslösen, wenn sich der Status tatsächlich geändert hat
    // Dadurch verhindern wir doppelte Events, die zu Verwirrung führen können
    if (currentOnline !== online) {
      // Wir importieren pubsub hier nicht, da das zu zirkulären Abhängigkeiten führen würde
      // Stattdessen geben wir ein Flag zurück, damit websocket-events.js weiß, dass ein Event gesendet werden sollte
      return { shouldPublish: true, eventUserId, online };
    }

    // If setting to online, check for active polls
    if (online === true) {
      try {
        const activePoll = await findActivePoll(eventUser.event_id);
        if (activePoll) {
          await createPollUserIfNeeded(activePoll.id, eventUserId);
        }
      } catch (error) {
        console.error(`[ERROR] Fehler beim Hinzufügen des Benutzers ${eventUserId} zum aktiven Poll:`, error);
      }
    }

    return { shouldPublish: false };
  } catch (error) {
    console.error(`[ERROR] Fehler beim Aktualisieren des Online-Status für Benutzer ${eventUserId}:`, error);
    return { shouldPublish: false };
  }
}

/**
 * todo refactor to two methods. one fetching the token record. the other triggers the online state.
 */
export async function toggleUserOnlineStateByRequestToken(token, online) {
  // Timestamp für den letzten Aktivitätszeitpunkt
  const timestamp = getCurrentUnixTimeStamp();

  // 1. Finde den EventUser anhand des Tokens - wir brauchen diese Info in beiden Fällen
  const findEventUserSql = `
    SELECT event_user.id, event_user.event_id
    FROM event_user
    INNER JOIN jwt_refresh_token
    ON jwt_refresh_token.event_user_id = event_user.id
    WHERE jwt_refresh_token.token = ?
  `;
  const eventUserResult = await query(findEventUserSql, [token]);
  const eventUser = eventUserResult[0];

  if (!eventUser) {
    // Kein EventUser gefunden, nichts zu tun
    return;
  }

  // Wenn wir den Nutzer als online markieren sollen
  if (online === true) {
    // Update online-Status und Timestamp
    const sql = `
      UPDATE event_user
      SET event_user.online = ?, event_user.last_activity = ?
      WHERE event_user.id = ?
    `;
    await query(sql, [online, timestamp, eventUser.id]);

    // WICHTIG: Prüfe, ob ein aktiver Poll existiert und füge Nutzer hinzu, falls ja
    try {
      const activePoll = await findActivePoll(eventUser.event_id);
      if (activePoll) {
        await createPollUserIfNeeded(activePoll.id, eventUser.id);
      }
    } catch (error) {
      console.error(`[ERROR] Fehler beim Hinzufügen des Benutzers ${eventUser.id} zum aktiven Poll:`, error);
    }

    return;
  }

  // Andernfalls (wenn wir offline markieren sollen), prüfen wir, ob ein aktiver Poll existiert
  const checkActivePollSql = `
    SELECT poll.id FROM poll
    INNER JOIN poll_result 
    ON poll.id = poll_result.poll_id
    WHERE poll.event_id = ? AND poll_result.closed = '0'
  `;
  const activePollResult = await query(checkActivePollSql, [eventUser.event_id]);

  // Wenn ein aktiver Poll existiert, aktualisieren wir nur den last_activity Zeitstempel,
  // aber nicht den Online-Status (der User bleibt online)
  if (activePollResult && activePollResult.length > 0) {
    const updateActivitySql = `
      UPDATE event_user
      SET event_user.last_activity = ?
      WHERE event_user.id = ?
    `;
    await query(updateActivitySql, [timestamp, eventUser.id]);
  } else {
    // Kein aktiver Poll, wir können den Benutzer offline setzen
    const sql = `
      UPDATE event_user
      SET event_user.online = ?, event_user.last_activity = ?
      WHERE event_user.id = ?
    `;
    await query(sql, [online, timestamp, eventUser.id]);
  }
}

export async function updateLastActivity(eventUserId) {
  const timestamp = getCurrentUnixTimeStamp();
  return await query(
    "UPDATE event_user SET last_activity = ?, online = true WHERE id = ?",
    [timestamp, eventUserId]
  );
}

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  if (input.password) {
    input.password = await hash(input.password);
  }
  return await insert("event_user", input);
}

export async function update(input) {
  if (input.password) {
    input.password = await hash(input.password);
  }
  await updateQuery("event_user", input);
}

export async function remove(id) {
  await query("DELETE FROM jwt_refresh_token WHERE event_user_id = ?", [id]);
  return await removeQuery("event_user", id);
}

export async function setEventUserOnline(id) {
  const timestamp = getCurrentUnixTimeStamp();
  return await query(
    "UPDATE event_user SET online = true, last_activity = ? WHERE id = ? AND online = false",
    [timestamp, id],
  );
}