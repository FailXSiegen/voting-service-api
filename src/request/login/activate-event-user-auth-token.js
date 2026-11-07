import { v4 as uuidv4 } from 'uuid';
import {
  activate,
  findOneInactiveByToken,
} from '../../repository/event-user-auth-token-repository';
import { update as updateEventUser } from '../../repository/event-user-repository';
import RecordNotFoundError from '../../errors/RecordNotFoundError';
import { eventUserAuthCookieOptions } from '../../server/security';

export default async function activateEventUserAuthToken(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const { token, username, publicName } = req.body || {};
    // SEC-13: nur Strings an die DB (Objekt im Body würde sonst jede Zeile treffen).
    if ([token, username, publicName].some((value) => typeof value !== 'string')) {
      throw new RecordNotFoundError('Token is invalid');
    }
    const existingToken = await findOneInactiveByToken(token);
    if (null === existingToken) {
      throw new RecordNotFoundError('Token is invalid');
    }
    await updateEventUser({
      id: existingToken.eventUserId,
      username,
      publicName,
    });
    // Generate a new token for security reasons.
    const newToken = uuidv4();
    await activate(token, newToken);
    // Set a cookie with the new token.
    res.status(201);
    res.cookie('eventUserAuthToken', newToken, eventUserAuthCookieOptions());
    res.send(
      JSON.stringify({
        success: true,
      })
    );
  } catch (error) {
    res.send(
      JSON.stringify({
        error: { name: error.name, message: 'Token is invalid' },
        success: false,
      })
    );
  }
}
