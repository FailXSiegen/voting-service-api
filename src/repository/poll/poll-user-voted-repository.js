import { insert, query } from '../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  return await insert('poll_user_voted', input)
}

export async function existInCurrentVote (pollResultId, eventUserId, voteCycle) {
  return await query(`
    SELECT id FROM poll_user_voted
    WHERE poll_result_id = ? AND event_user_id = ? AND vote_cycle = ?
  `, [pollResultId, eventUserId, voteCycle])
}

export async function findByPollResultId (pollResultId) {
  const result = await query('SELECT * FROM poll_user_voted WHERE poll_result_id = ?', [pollResultId])
  return Array.isArray(result) ? result : []
}
