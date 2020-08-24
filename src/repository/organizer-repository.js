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

export async function findById (id) {
  return await query('SELECT * FROM organizer WHERE id = ?', [id])
}

export async function findOneByEmail (email) {
  return await query('SELECT * FROM organizer WHERE email = ?', [email])
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
  if (!validateEmail(input.email)) {
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
