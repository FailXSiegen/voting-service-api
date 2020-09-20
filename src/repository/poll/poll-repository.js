import {
  insert,
  update as updateQuery,
  remove as removeQuery, query
} from './../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'
import { pollTypeConverterToString } from '../../graphql/resolver/poll/poll'

export async function findOneById (id) {
  const result = await query('SELECT * FROM poll WHERE id = ?', [id])
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
  return await removeQuery('poll', id)
}
