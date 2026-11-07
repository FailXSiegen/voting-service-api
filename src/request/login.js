import loginOrganizer from '../auth/login/login-organizer';
import { loginEventUser } from '../auth/login/login-event-user';
import { setRefreshCookie } from '../auth/login/session';

// Fehler, die der Client gezielt anzeigt. Alles andere wird zu "ungültige Zugangsdaten",
// damit sich Benutzernamen nicht enumerieren lassen (SEC-38) und keine Interna rausgehen.
const EVENT_ERRORS = [
  'EventNotFoundError',
  'InactiveEventLoginError',
  'InvalidAnonymousLoginError',
];

export default async function loginRequest(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const requestArguments = req.body || {};
    let result;
    switch (requestArguments.loginType) {
      case 'organizer':
        result = await loginOrganizer(requestArguments);
        break;
      case 'event-user':
        result = await loginEventUser(requestArguments);
        break;
      default:
        throw new Error('Invalid loginType');
    }

    res.status(201);
    setRefreshCookie(res, result.refreshToken);
    res.send(
      JSON.stringify({
        succes: true,
        token: result.token,
        expiresAt: result.decodedToken.exp,
      })
    );
  } catch (error) {
    const name = EVENT_ERRORS.includes(error?.name) ? error.name : 'AuthenticationError';
    if (name === 'AuthenticationError' && error?.name !== 'AuthenticationError') {
      console.error('Login error:', error?.message);
    }
    res.send(
      JSON.stringify({
        succes: false,
        error: {
          name,
          message: name === 'AuthenticationError' ? 'Invalid username or password' : error.message,
          code: name === 'AuthenticationError' ? 'INVALID_CREDENTIALS' : name,
        },
      })
    );
  }
}
