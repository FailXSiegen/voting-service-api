import { insert, query } from '../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  return await insert('poll_user_voted', input)
}

export async function existInCurrentVote (pollResultId, eventUserId) {
  return await query(`
    SELECT id FROM poll_user_voted
    WHERE poll_result_id = ? AND event_user_id = ?
  `, [pollResultId, eventUserId])
}

export async function allowToCreateNewVote (pollResultId, eventUserId) {
  const result = await query(`
    SELECT poll_user_voted.id FROM poll_user_voted
    INNER JOIN event_user
    ON event_user.id = poll_user_voted.event_user_id
    WHERE poll_user_voted.poll_result_id = ? AND event_user.id = ? AND event_user.vote_amount > poll_user_voted.vote_cycle
  `, [pollResultId, eventUserId])
  if (Array.isArray(result)) {
    await query(`
      UPDATE poll_user_voted
      SET vote_cycle = vote_cycle + 1
      WHERE poll_user_voted.poll_result_id = ? AND poll_user_voted.event_user_id = ?
  `, [pollResultId, eventUserId])
  }
  return Array.isArray(result)
}

export async function findByPollResultId (pollResultId) {
  const result = await query('SELECT * FROM poll_user_voted WHERE poll_result_id = ?', [pollResultId])
  return Array.isArray(result) ? result : []
}
