import { insert } from '../../lib/database'
import { getCurrentUnixTimeStamp } from '../../lib/time-stamp'

export async function create (input) {
  input.createDatetime = getCurrentUnixTimeStamp()
  return await insert('poll_user_voted', input)
}
