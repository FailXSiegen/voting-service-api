import {
  insert,
  update as updateQuery,
  remove as removeQuery, query
} from './../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'

export async function findPollResult (eventId) {
  return await query('SELECT poll_result.* FROM ' +
    'poll_result INNER JOIN poll ' +
    'ON poll.id = poll_result.poll_id ' +
    'WHERE poll.event_id = ? ',
  [eventId])
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
