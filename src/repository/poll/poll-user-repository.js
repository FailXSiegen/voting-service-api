import {
  insert,
  update as updateQuery,
  remove as removeQuery,
  query,
} from "./../../lib/database";

import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";

export async function findByEventId(pollId) {
  return await query(
    "SELECT poll_user.* FROM poll_user INNER JOIN poll ON poll.id = poll_user.poll_id WHERE poll.id = ?",
    [pollId],
  );
}

export async function findById(pollUserId) {
  const result = await query("SELECT * FROM poll_user WHERE id = ?", [
    pollUserId,
  ]);
  return Array.isArray(result) ? result[0] || null : null;
}

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert("poll_user", input);
}

export async function update(input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp();
  await updateQuery("poll_user", input);
}

export async function remove(id) {
  return await removeQuery("poll_user", id);
}

export async function existAsPollUserInCurrentVote(pollResultId, eventUserId) {
  await query(
    `
   UPDATE event_user SET online = 1 WHERE id = ?
  `,
    [eventUserId],
  );
  return await query(
    `
    SELECT poll_user.id FROM poll_user
    INNER JOIN poll_result
    ON poll_result.poll_id = poll_user.poll_id
    WHERE poll_result.id = ? AND poll_user.event_user_id = ?
  `,
    [pollResultId, eventUserId],
  );
}

export async function createPollUserWithPollResultId(
  pollResultId,
  eventUserId,
) {
  const createDatetime = getCurrentUnixTimeStamp();
  console.log(`[DEBUG:CREATE_POLL_USER] Starting for pollResultId=${pollResultId}, eventUserId=${eventUserId}`);
  
  const userInformation = await query(
    `
  SELECT event_user.public_name, event_user.username FROM event_user WHERE event_user.id = ? AND event_user.verified = 1 AND event_user.allow_to_vote = 1
  `,
    [eventUserId],
  );
  
  console.log(`[DEBUG:CREATE_POLL_USER] Query result:`, userInformation);
  console.log(`[DEBUG:CREATE_POLL_USER] userInformation[0]:`, userInformation?.[0]);
  
  if (Array.isArray(userInformation) && userInformation.length > 0) {
    await query(
      `
    INSERT INTO poll_user (event_user_id, public_name, username, poll_id, create_datetime)
    SELECT ?, ?, ?, poll_result.poll_id, ? FROM poll_result WHERE poll_result.id = ?
  `,
      [
        eventUserId,
        userInformation[0].publicName,
        userInformation[0].username,
        createDatetime,
        pollResultId,
      ],
    );
    return true;
  }
  return false;
}
