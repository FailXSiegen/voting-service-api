import * as jwt from 'jsonwebtoken'

export async function generateJwt (claims) {
  return await jwt.sign(claims, process.env.JWT_SECRET, {
    expiresIn: 86400 * 30,
    issuer: process.env.JWT_ISSUER
  })
}

export async function verifyJwt (token) {
  let result = null
  await jwt.verify(token, process.env.JWT_SECRET, (error, data) => {
    if (error) {
      throw error
    }
    result = data
  })
  return result
}
