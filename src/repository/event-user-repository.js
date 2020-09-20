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

export async function findOneByUsernameAndEvenId (username, eventId) {
  const result = await query('SELECT * FROM event_user WHERE username = ? AND event_id = ?', [username, eventId])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findEventUserByEvent (eventId, verified = true) {
  return await query('SELECT * FROM event_user WHERE event_id = ? AND verified = ?', [eventId, verified])
}

export async function toggleUserOnlineStateByRequestToken (token, online) {
  const sql = `
    UPDATE event_user
    INNER JOIN jwt_refresh_token
    ON jwt_refresh_token.event_user_id = event_user.id
    SET event_user.online = ?
    WHERE jwt_refresh_token.token = ?
  `
  return await query(sql, [online, token])
}

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  input.password = await hash(input.password)
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
