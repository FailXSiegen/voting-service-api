import {
  insert,
  update as updateQuery,
  remove as removeQuery, query
} from './../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'
import { pollTypeConverterToString } from '../../graphql/resolver/poll/poll'
import { removeByPoll } from './poll-possible-answer-repository'

export async function findOneById (id) {
  const result = await query('SELECT * FROM poll WHERE id = ?', [id])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findOneByPollResultId (pollResultId) {
  const result = await query(`
    SELECT poll.*
    FROM poll
    LEFT JOIN poll_result ON poll_result.poll_id = poll.id
    WHERE poll_result.id = ?
  `, [pollResultId])
  return Array.isArray(result) ? result[0] || null : null
}

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  input.type = pollTypeConverterToString(input.type)
  return await insert('poll', input)
}

export async function update (input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp()
  await updateQuery('poll', input)
}

export async function remove (id) {
  await removeByPoll(id)
  return await removeQuery('poll', id)
}

export async function findPollsWithNoResults (eventId) {
  return await query(`
  SELECT poll.*
  FROM poll
  LEFT JOIN poll_result ON poll.id = poll_result.poll_id
  WHERE poll.event_id = ?
  AND poll_result.poll_id IS NULL
  `,
  [eventId])
}

export async function findActivePoll (eventId) {
  const result = await query(`
  SELECT poll.*, poll_result.max_votes, COUNT(poll_answer.id) AS answerCount
  FROM poll
  INNER JOIN poll_result ON poll.id = poll_result.poll_id
  INNER JOIN poll_answer ON poll_result.id = poll_answer.poll_result_id
  WHERE poll.event_id = ? AND poll_result.closed = 0
  GROUP BY poll.id
  `,
  [eventId])
  return Array.isArray(result) ? result[0] || null : null
}
