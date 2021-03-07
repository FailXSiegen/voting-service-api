import verifyPassword from '../../auth/login/login-verify-password'

export default async function requestVerifyPassword (req, res) {
  res.setHeader('content-type', 'application/json')
  try {
    const requestArguments = req.body
    if (!requestArguments.username || !requestArguments.password) {
      throw new Error('Missing parameter')
    }
    const passwordIsVerified = await verifyPassword(requestArguments.username, requestArguments.password)
    if (!passwordIsVerified) {
      throw new Error('Password is invalid')
    }
    res.send(JSON.stringify({
      success: true
    }))
  } catch (error) {
    res.send(JSON.stringify({
      error: error.message,
      success: false
    }))
  }
}
