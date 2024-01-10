import {
  insert,
  update as updateQuery,
  remove as removeQuery,
  query,
} from "./../../lib/database";
import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";
import { pollTypeConverterToString } from "../../graphql/resolver/poll/poll";
import { findOneByPollId as findOnePollResultByPollId } from "./poll-result-repository";

export async function findOneById(id) {
  const result = await query("SELECT * FROM poll WHERE id = ?", [id]);
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findOneByPollResultId(pollResultId) {
  const result = await query(
    `
    SELECT poll.*
    FROM poll
    LEFT JOIN poll_result ON poll_result.poll_id = poll.id
    WHERE poll_result.id = ?
  `,
    [pollResultId],
  );
  return Array.isArray(result) ? result[0] || null : null;
}

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  input.type = pollTypeConverterToString(input.type);
  return await insert("poll", input);
}

export async function update(input) {
  await deltePollReferences(input.id);
  input.createDatetime = getCurrentUnixTimeStamp();
  input.type = pollTypeConverterToString(input.type);
  await updateQuery("poll", input);
}

export async function remove(id) {
  await deltePollReferences(id);
  return await removeQuery("poll", id);
}

export async function findPollsWithNoResults(eventId) {
  return await query(
    `
  SELECT poll.*
  FROM poll
  LEFT JOIN poll_result ON poll.id = poll_result.poll_id
  WHERE poll.event_id = ?
  AND poll_result.poll_id IS NULL
  `,
    [eventId],
  );
}

export async function findPollsByEventId(eventId) {
  return await query("SELECT poll.* FROM poll WHERE poll.event_id = ?", [
    eventId,
  ]);
}

async function deltePollReferences(pollId) {
  const pollResult = await findOnePollResultByPollId(pollId);
  if (pollResult) {
    await query("DELETE FROM poll_user_voted WHERE poll_result_id = ?", [
      pollResult.id,
    ]);
    await query("DELETE FROM poll_result WHERE poll_id = ?", [pollId]);
  }
  await query("DELETE FROM poll_possible_answer WHERE poll_id = ?", [pollId]);
  await query("DELETE FROM poll_user WHERE poll_id = ?", [pollId]);
}
