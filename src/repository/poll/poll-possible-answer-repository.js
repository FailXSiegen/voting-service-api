import { insert, query } from './../../lib/database';
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp';

export async function findByPollId(pollId) {
  const result = await query('SELECT * FROM poll_possible_answer WHERE poll_id = ?', [pollId]);
  return Array.isArray(result) ? result : [];
}

export async function create(input) {
  input.createDatetime = getCurrentUnixTimeStamp();
  return await insert('poll_possible_answer', input);
}
