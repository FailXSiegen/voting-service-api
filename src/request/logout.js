import { extractCookieValueByHeader } from '../lib/cookie-from-string-util'
import { query } from '../lib/database'
import { pubsub } from '../server/graphql'
import { EVENT_USER_LIFE_CYCLE } from '../graphql/resolver/subscription/subscription-types'

export default async function logoutRequest (req, res) {
  const token = extractCookieValueByHeader(req.headers.cookie, 'refreshToken')
  if (typeof token !== 'string' || token.length === 0) {
    res.send(JSON.stringify({
      success: false
    }))
    return
  }
  const result = await query('SELECT event_user_id FROM jwt_refresh_token WHERE token = ?', [token])
  const tokenRecord = Array.isArray(result) ? result[0] || null : null
  if (tokenRecord && tokenRecord.eventUserId && tokenRecord.eventUserId > 0) {
    await query('UPDATE event_user SET online = ? WHERE id = ?', [false, tokenRecord.eventUserId])
    pubsub.publish(EVENT_USER_LIFE_CYCLE, {
      online: false,
      eventUserId: tokenRecord.eventUserId
    })
    console.log('logout')
  }
  await query('DELETE FROM jwt_refresh_token WHERE token = ?', [token])
  res.send(JSON.stringify({
    success: true
  }))
}
