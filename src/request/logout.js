import { extractCookieValueByHeader } from '../lib/cookie-from-string-util'
import { query } from '../lib/database'
import { pubsub } from '../index'

export default async function logoutRequest (req, res) {
  const token = extractCookieValueByHeader(req.headers.cookie, 'refreshToken')
  if (typeof token !== 'string' || token.length === 0) {
    res.send(JSON.stringify({
      success: false
    }))
  }
  const result = await query('SELECT event_user_id FROM jwt_refresh_token WHERE token = ?', [token])
  const tokenRecord = Array.isArray(result) ? result[0] || null : null
  if (tokenRecord && tokenRecord.eventUserId && tokenRecord.eventUserId > 0) {
    await query('UPDATE event_user SET online = ? WHERE id = ?', [false, tokenRecord.eventUserId])
    pubsub.publish('eventUserLifeCycle', {
      eventUserLifeCycle: {
        online: false,
        eventUserId: tokenRecord.eventUserId
      }
    })
  }
  await query('DELETE FROM jwt_refresh_token WHERE token = ?', [token])
  res.send(JSON.stringify({
    success: true
  }))
}
