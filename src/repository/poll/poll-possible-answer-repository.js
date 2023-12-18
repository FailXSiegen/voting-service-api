import {
  insert,
  update as updateQuery,
  remove as removeQuery,
  query,
} from "./../../lib/database";
import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";

export async function findByPollId(pollId) {
  const result = await query(
    "SELECT * FROM poll_possible_answer WHERE poll_id = ?",
    [pollId],
  );
  return Array.isArray(result) ? result : [];
}

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert("poll_possible_answer", input);
}

export async function update(input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp();
  await updateQuery("poll_possible_answer", input);
}

export async function remove(id) {
  return await removeQuery("poll_possible_answer", id);
}
