import * as jwt from 'jsonwebtoken'
import AuthenticationError from '../errors/AuthenticationError'

const authenticate = async (resolve, root, args, context, info) => {
  try {
    const authHeader = context.req.get('Authorization')
    const token = authHeader.split(' ')[1] || ''
    await jwt.verify(token, process.env.JWT_SECRET)
  } catch (e) {
    return new AuthenticationError()
  }
  return await resolve(root, args, context, info)
}

export default authenticate
