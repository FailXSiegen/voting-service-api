import {
  query,
  insert,
  update as updateQuery,
  remove as removeQuery
} from './../lib/database'
import { getCurrentUnixTimeStamp } from '../lib/time-stamp'

export async function findOneBySlug (slug) {
  const result = await query('SELECT * FROM event WHERE slug = ?  AND deleted = 0', [slug])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findByOrganizer (organizerId) {
  return await query(
    'SELECT * FROM event WHERE organizer_id = ?  AND deleted = 0',
    [organizerId]
  )
}

export async function findEventIdByPollResultId (pollResultId) {
  const result = await query(
    'SELECT poll.event_id FROM poll INNER JOIN poll_result ON poll.id = poll_result.poll_id WHERE poll_result.id = ?',
    [pollResultId]
  )
  return Array.isArray(result) ? result[0].eventId || null : null
}

export async function eventIsActive (eventId) {
  const result = await query(
    'SELECT event.active FROM event WHERE event.id = ?',
    [eventId]
  )
  return Array.isArray(result) ? result[0].active === 1 : false
}

export async function findUpcoming (organizerId) {
  const currentTimestamp = getCurrentUnixTimeStamp()
  return await query(
    'SELECT * FROM event WHERE organizer_id = ? AND deleted = 0 AND scheduled_datetime > ?',
    [organizerId, currentTimestamp]
  )
}

export async function findExpired (organizerId) {
  const currentTimestamp = getCurrentUnixTimeStamp()
  return await query(
    'SELECT * FROM event WHERE organizer_id = ? AND deleted = 0 AND scheduled_datetime <= ?',
    [organizerId, currentTimestamp]
  )
}

export async function findAllUpcomingEvents () {
  const currentTimestamp = getCurrentUnixTimeStamp()
  return await query(
    'SELECT * FROM event WHERE event.deleted = 0 AND event.active = 1 AND event.scheduled_datetime > ? ORDER BY event.scheduled_datetime ASC',
    [currentTimestamp]
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
