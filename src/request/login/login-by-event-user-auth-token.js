import { addRefreshToken } from '../../auth/login/refresh-token';
import { signSession, setRefreshCookie } from '../../auth/login/session';
import { findOneByToken } from '../../repository/event-user-auth-token-repository';
import { findOneById } from '../../repository/event-user-repository';

export default async function loginByEventUserAuthToken(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const { eventUserAuthToken } = req.signedCookies;
    // SEC-13: nur Strings an die DB.
    const tokenRecord =
      typeof eventUserAuthToken === 'string' ? await findOneByToken(eventUserAuthToken) : null;
    const eventUser = tokenRecord ? await findOneById(tokenRecord.eventUserId) : null;

    if (!tokenRecord || !eventUser) {
      res.status(200);
      res.send(JSON.stringify({ success: false }));
      return;
    }

    const { token, decodedToken } = await signSession('event-user', eventUser);
    const refreshToken = await addRefreshToken('event-user', eventUser.id);

    res.status(201);
    setRefreshCookie(res, refreshToken);
    res.send(JSON.stringify({ token, expiresAt: decodedToken.exp }));
  } catch (error) {
    console.error('Auth-token login error:', error.message);
    res.status(200).send(JSON.stringify({ success: false }));
  }
}
