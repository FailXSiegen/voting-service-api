import {
  insert,
  update as updateQuery,
  remove as removeQuery,
  query,
} from "./../../lib/database";
import { getCurrentUnixTimeStamp } from "../../lib/time-stamp";

export async function findByPollResultId(pollResultId) {
  const result = await query(
    "SELECT * FROM poll_answer WHERE poll_result_id = ?",
    [pollResultId],
  );
  return Array.isArray(result) ? result : [];
}

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert("poll_answer", input);
}

export async function update(input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp();
  await updateQuery("poll_answer", input);
}

export async function remove(id) {
  return await removeQuery("poll_answer", id);
}

export async function insertPollSubmitAnswer(input) {
  if (input.type === "PUBLIC") {
    let pollUserId = await query(
      `
      SELECT poll_user.id FROM poll_user
      INNER JOIN poll_result ON poll_user.poll_id = poll_result.poll_id
      WHERE poll_user.event_user_id = ? AND poll_result.id = ?`,
      [input.eventUserId, input.pollResultId],
    );
    pollUserId = Array.isArray(pollUserId) ? pollUserId[0] : [];
    await query(
      `
      INSERT INTO poll_answer SET poll_result_id = ?,
      poll_possible_answer_id = ?,
      answer_content = ?,
      poll_user_id = ?,
      create_datetime = ?`,
      [
        input.pollResultId,
        input.possibleAnswerId,
        input.answerContent,
        pollUserId.id,
        getCurrentUnixTimeStamp(),
      ],
    );
  } else {
    await query(
      `
      INSERT INTO poll_answer SET poll_result_id = ?,
      poll_possible_answer_id = ?,
      answer_content = ?,
      create_datetime = ?`,
      [
        input.pollResultId,
        input.possibleAnswerId,
        input.answerContent,
        getCurrentUnixTimeStamp(),
      ],
    );
  }
}
