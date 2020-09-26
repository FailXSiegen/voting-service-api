import {
  query,
  insert,
  update as updateQuery,
  remove as removeQuery
} from './../lib/database'
import { hash } from '../lib/crypto'
import { getCurrentUnixTimeStamp } from '../lib/time-stamp'

export async function findOneById (id) {
  const result = await query('SELECT * FROM event_user WHERE id = ?', [id])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findOneByUsernameAndEventId (username, eventId) {
  const result = await query('SELECT * FROM event_user WHERE username = ? AND event_id = ?', [username, eventId])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findEventUserByEventId (eventId) {
  return await query('SELECT * FROM event_user WHERE event_id = ?', [eventId])
}

export async function findOnlineEventUserByEventId (eventId) {
  return await query('SELECT * FROM event_user WHERE event_id = ? AND online = 1 AND allow_to_vote = 1', [eventId])
}

export async function toggleUserOnlineStateByRequestToken (token, online) {
  const sql = `
    UPDATE event_user
    INNER JOIN jwt_refresh_token
    ON jwt_refresh_token.event_user_id = event_user.id
    SET event_user.online = ?
    WHERE jwt_refresh_token.token = ?
  `
  // Update online state.
  await query(sql, [online, token])
  // Fetch event user id for further processing.
  const result = await query('SELECT event_user_id FROM jwt_refresh_token WHERE token = ?', [token])

  return Array.isArray(result) ? result[0] || null : null
}

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  if (input.password) {
    input.password = await hash(input.password)
  }
  return await insert('event_user', input)
}

export async function update (input) {
  if (input.password) {
    input.password = await hash((input.password))
  }
  await updateQuery('event_user', input)
}

export async function remove (id) {
  return await removeQuery('event_user', id)
}
