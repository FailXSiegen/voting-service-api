import {
  insert,
  update as updateQuery,
  remove as removeQuery, query
} from './../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'

export async function findOneById (id) {
  const result = await query('SELECT * FROM poll_result WHERE id = ?', [id])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findClosedPollResults (eventId) {
  return await query(`
    SELECT poll_result.*
    FROM poll_result
    INNER JOIN poll ON poll.id = poll_result.poll_id
    WHERE poll.event_id = ?
    AND poll_result.closed = ?
  `,
  [eventId, true])
}

export async function resultAcceptsVotes (pollResultId) {
  const result = await query(`
    SELECT poll_result.id, poll_result.max_votes,
    COUNT(poll_answer.id) AS poll_answers_count
    FROM poll_result
    LEFT JOIN poll_answer ON poll_answer.poll_result_id = poll_result.id
    WHERE poll_result.id = ?
    GROUP BY poll_result.id
    HAVING poll_answers_count < poll_result.max_votes
  `, [pollResultId])
  return result !== null
}

export async function closePollResult (pollResultId) {
  await query(
    'UPDATE poll_result SET closed = ? WHERE id = ?',
    [true, pollResultId]
  )
}

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  return await insert('poll_result', input)
}

export async function update (input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp()
  await updateQuery('poll_result', input)
}

export async function remove (id) {
  return await removeQuery('poll_result', id)
}
