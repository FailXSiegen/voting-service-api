import {
  query,
  insert,
  update as updateQuery,
  remove as removeQuery
} from './../lib/database'
import { hash } from '../lib/crypto'
import { getCurrentUnixTimeStamp } from '../lib/time-stamp'
import { validateEmail } from '../lib/validator'
import InvalidEmailFormatError from '../errors/InvalidEmailFormatError'

export async function findOneByEmail (email) {
  const result = await query('SELECT * FROM organizer WHERE email = ?', [email])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findOneByUsername (username) {
  const result = await query('SELECT * FROM organizer WHERE username = ?', [username])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findOneById (id) {
  const result = await query('SELECT * FROM organizer WHERE id = ?', [id])

export async function findOneByHash (hash) {
  const result = await query('SELECT * FROM organizer WHERE hash = ?', [hash])
  return Array.isArray(result) ? result[0] || null : null
}

export async function findOrganizers () {
  return await query('SELECT * FROM organizer')
}

export async function create (input) {
  if (!validateEmail(input.email)) {
    throw new InvalidEmailFormatError()
  }
  input.password = await hash((input.password))
  input.createDatetime = getCurrentUnixTimeStamp()
  await insert('organizer', input)
}

export async function update (input) {
  if (input.email && !validateEmail(input.email)) {
    throw new InvalidEmailFormatError()
  }
  if (input.password) {
    input.password = await hash((input.password))
  }
  await updateQuery('organizer', input)
}

export async function remove (id) {
  return await removeQuery('organizer', id)
}
