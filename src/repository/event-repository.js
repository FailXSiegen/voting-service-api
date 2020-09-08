import {
  query,
  insert,
  update as updateQuery,
  remove as removeQuery
} from './../lib/database'
import { getCurrentUnixTimeStamp } from '../lib/time-stamp'

export async function findOneBySlug (slug) {
  const result = await query('SELECT * FROM event WHERE slug = ?', [slug])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findUpcoming (organizerId) {
  const currentTimestamp = getCurrentUnixTimeStamp()
  return await query(
    'SELECT * FROM event WHERE organizer_id = ? AND scheduled_datetime > ?',
    [organizerId, currentTimestamp]
  )
}

export async function findExpired (organizerId) {
  const currentTimestamp = getCurrentUnixTimeStamp()
  return await query(
    'SELECT * FROM event WHERE organizer_id = ? AND scheduled_datetime <= ?',
    [organizerId, currentTimestamp]
  )
}

export async function create (input) {
  const currentTime = getCurrentUnixTimeStamp()
  input.createDatetime = currentTime
  input.modifiedDatetime = currentTime
  await insert('event', input)
}

export async function update (input) {
  input.modifiedDatetime = getCurrentUnixTimeStamp()
  await updateQuery('event', input)
}

export async function remove (id) {
  return await removeQuery('event', id)
}
