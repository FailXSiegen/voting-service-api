import {
  addRefreshToken,
  fetchRefreshToken
} from '../../auth/login/refresh-token'
import { generateJwt } from '../../lib/jwt-auth'
import * as jwt from 'jsonwebtoken'

export default async function loginRefreshRequest (req, res) {
  res.setHeader('content-type', 'application/json')
  try {
    const signedCookies = req.signedCookies
    if (!signedCookies.refreshToken) {
      throw new Error('Could not fetch refreshToken cookie')
    }
    const tokenRecord = await fetchRefreshToken(signedCookies.refreshToken)
    const type = tokenRecord.organizerId > 0 ? 'organizer' : 'event-user'
    const id = type === 'organizer' ? tokenRecord.organizerId : tokenRecord.eventUserId
    const verified = tokenRecord.verified
    const claims = {
      user: { id, type, verified },
      role: type
    }
    const token = await generateJwt(claims)
    const decodedToken = await jwt.verify(token, process.env.JWT_SECRET)
    const refreshToken = await addRefreshToken(decodedToken.user.type, decodedToken.user.id)
    res.status(201)
    res.cookie('refreshToken', refreshToken, {
      maxAge: 1000 * 60 * 15, // Expire after 15 minutes
      httpOnly: true,
      signed: true,
      secure: process.env.NODE_ENV === 'production'
    })
    res.send(JSON.stringify({
      token: token,
      expiresAt: decodedToken.exp
    }))
  } catch (error) {
    res.send('Error: ' + error.message)
  }
}
