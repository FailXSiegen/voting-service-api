import {
  query,
  insert,
  update as updateQuery,
  remove as removeQuery
} from './../lib/database'
import { getCurrentUnixTimeStamp } from '../lib/time-stamp'

export async function findById (id) {
  return await query('SELECT * FROM event WHERE id = ?', [id])
}

export async function findBySlug (slug) {
  return await query('SELECT * FROM event WHERE slug = ?', [slug])
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
