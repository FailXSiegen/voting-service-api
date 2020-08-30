import loginOrganizer from '../auth/login/login-organizer'

export default async function loginRequest (req, res) {
  res.setHeader('content-type', 'application/json')
  try {
    const requestArguments = req.body
    if (!requestArguments.loginType) {
      // throw missing loginType argument error
      throw new Error('Missing loginType')
    }
    let result = {}
    switch (requestArguments.loginType) {
      case 'organizer':
        result = await loginOrganizer(requestArguments)
        break
      default:
        throw new Error('Invalid loginTyp')
    }
    res.cookie('refreshToken', result.refreshToken, {
      maxAge: 1000 * 60 * 15, // Expire after 15 minutes
      httpOnly: true,
      signed: true,
      secure: process.env.NODE_ENV === 'production'
    })
    res.send(JSON.stringify({
      token: result.token,
      expiresAt: result.decodedToken.exp
    }))
  } catch (error) {
    res.send(JSON.stringify({
      error: error.message
    }))
  }
}
