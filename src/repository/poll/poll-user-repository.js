import {
  insert,
  update as updateQuery,
  remove as removeQuery, query
} from './../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'

export async function findByEventId (pollId) {
  return await query('SELECT poll_user.* FROM poll_user INNER JOIN poll ON poll.id = poll_user.poll_id WHERE poll.id = ?', [pollId])
}

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  return await insert('poll_user', input)
}

export async function update (input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp()
  await updateQuery('poll_user', input)
}

export async function remove (id) {
  return await removeQuery('poll_user', id)
}
