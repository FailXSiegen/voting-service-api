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

export async function getMultivoteType (eventId) {
  const result = await query(
    'SELECT event.multivote_type FROM event WHERE event.id = ?',
    [eventId]
  )
  return Array.isArray(result) ? result[0].multivoteType : 1
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

export async function findAllPastEvents (page, pageSize) {
  const currentTimestamp = getCurrentUnixTimeStamp()
  const offset = page * pageSize
  return await query(
    'SELECT * FROM event WHERE event.deleted = 0 AND event.scheduled_datetime <= ? ORDER BY event.scheduled_datetime ASC LIMIT ? OFFSET ?',
    [currentTimestamp, pageSize, offset]
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

export async function remove (organizerId, id) {
  await query(
    'DELETE poll_user_voted FROM poll_user_voted INNER JOIN poll_result ON poll_user_voted.poll_result_id = poll_result.id INNER JOIN poll ON poll_result.poll_id = poll.id INNER JOIN event ON poll.event_id = event.id WHERE event.organizer_id = ? AND event.id = ?',
    [organizerId, id]
  )
  await query(
    'DELETE poll_possible_answer FROM poll_possible_answer INNER JOIN poll ON poll_possible_answer.poll_id = poll.id INNER JOIN event ON poll.event_id = event.id WHERE event.organizer_id = ? AND event.id = ?',
    [organizerId, id]
  )
  await query(
    'DELETE poll_answer FROM poll_answer INNER JOIN poll_result ON poll_answer.poll_result_id = poll_result.id INNER JOIN poll ON poll_result.poll_id = poll.id INNER JOIN event ON poll.event_id = event.id WHERE event.organizer_id = ? AND event.id = ?',
    [organizerId, id]
  )
  await query(
    'DELETE poll_user FROM poll_user INNER JOIN poll ON poll_user.poll_id = poll.id INNER JOIN event ON poll.event_id = event.id WHERE event.organizer_id = ? AND event.id = ?',
    [organizerId, id]
  )
  await query(
    'DELETE poll_result FROM poll_result INNER JOIN poll ON poll_result.poll_id = poll.id INNER JOIN event ON poll.event_id = event.id WHERE event.organizer_id = ? AND event.id = ?',
    [organizerId, id]
  )
  await query(
    'DELETE poll FROM poll INNER JOIN event  ON poll.event_id = event.id WHERE event.organizer_id = ? AND event.id = ?',
    [organizerId, id]
  )
  await query(
    'DELETE jwt_refresh_token FROM jwt_refresh_token INNER JOIN event_user ON jwt_refresh_token.event_user_id = event_user.id INNER JOIN event ON event_user.event_id = event.id WHERE event.organizer_id = ? AND event.id = ?',
    [organizerId, id]
  )
  await query(
    'DELETE event_user FROM event_user INNER JOIN event  ON event_user.event_id = event.id WHERE event.organizer_id = ? AND event.id = ?',
    [organizerId, id]
  )
  await query(
    'DELETE event FROM event WHERE event.organizer_id = ? AND event.id = ?',
    [organizerId, id]
  )
  return true
}
