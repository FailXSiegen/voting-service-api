import {
  query,
  insert,
  update as updateQuery,
  remove as removeQuery,
} from "./../lib/database";
import { hash } from "../lib/crypto";
import { getCurrentUnixTimeStamp } from "../lib/time-stamp";
import {
  findActivePollByUserId,
  updatePollResultMaxVotes,
} from "./poll/poll-result-repository";
import {
  createPollUserWithPollResultId,
  existAsPollUserInCurrentVote,
} from "./poll/poll-user-repository";

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

export async function findOnlineEventUserByEventId(eventId) {
  return await query(
    "SELECT * FROM event_user WHERE event_id = ? AND verified = 1 AND online = 1 AND allow_to_vote = 1 ORDER BY public_name ASC",
    [eventId],
  );
}

export async function toggleUserOnlineStateByRequestToken(token, online) {
  const sql = `
    UPDATE event_user
    INNER JOIN jwt_refresh_token
    ON jwt_refresh_token.event_user_id = event_user.id
    SET event_user.online = ?
    WHERE jwt_refresh_token.token = ?
  `;
  // Update online state.
  await query(sql, [online, token]);
  // Fetch event user id for further processing.
  const result = await query(
    "SELECT event_user_id FROM jwt_refresh_token WHERE token = ?",
    [token],
  );

  if (!result) {
    return;
  }

  const pollResultId = await findActivePollByUserId(result[0].eventUserId);
  if (pollResultId) {
    const userExists = await existAsPollUserInCurrentVote(
      pollResultId.id,
      result[0].eventUserId,
    );
    if (userExists === null) {
      const newPollUser = await createPollUserWithPollResultId(
        pollResultId.id,
        result[0].eventUserId,
      );
      if (newPollUser) {
        await updatePollResultMaxVotes(pollResultId.id, result[0].eventUserId);
      }
    }
  }

  return Array.isArray(result) ? result[0] || null : null;
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
  return await query(
    "UPDATE event_user SET online = true WHERE id = ? AND online = false",
    [id],
  );
}
