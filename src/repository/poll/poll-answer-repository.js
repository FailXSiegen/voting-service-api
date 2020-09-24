import {
  insert,
  update as updateQuery,
  remove as removeQuery, query
} from './../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'

export async function findByPollResultId (pollResultId) {
  const result = await query('SELECT * FROM poll_answer WHERE poll_result_id = ?', [pollResultId])
  return Array.isArray(result) ? result : []
}

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  return await insert('poll_answer', input)
}

export async function update (input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp()
  await updateQuery('poll_answer', input)
}

export async function remove (id) {
  return await removeQuery('poll_answer', id)
}
