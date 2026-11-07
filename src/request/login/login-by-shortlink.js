import { findOneByShortCode } from '../../repository/event-user-shortlink-repository';
import { findOneById as findEventUserById } from '../../repository/event-user-repository';
import { findById as findEventById } from '../../repository/event-repository';
import { addRefreshToken } from '../../auth/login/refresh-token';
import { signSession, setRefreshCookie } from '../../auth/login/session';

// SEC-40 (API-Teil): Magic-Link-Login direkt mit dem Shortcode. Damit braucht der Client weder
// Benutzername/Public Name in der URL noch das aus öffentlichen Daten abgeleitete Passwort
// (hashString(username + event.createDatetime) in EventUserLogin.vue).
export default async function loginByShortlink(req, res) {
  res.setHeader('content-type', 'application/json');
  res.set('Cache-Control', 'no-store');
  const fail = () => res.status(200).send(JSON.stringify({ success: false }));
  try {
    const shortCode = req.body?.shortCode;
    if (typeof shortCode !== 'string' || !/^[a-z0-9]{4,32}$/.test(shortCode)) return fail();
    const shortlink = await findOneByShortCode(shortCode);
    const event = shortlink ? await findEventById(shortlink.eventId) : null;
    if (!event?.active || !event?.allowMagicLink) return fail();
    const eventUser = await findEventUserById(shortlink.eventUserId);
    if (!eventUser || Number(eventUser.eventId) !== Number(event.id)) return fail();

    const refreshToken = await addRefreshToken('event-user', eventUser.id);
    const { token, decodedToken } = await signSession('event-user', eventUser);
    res.status(201);
    setRefreshCookie(res, refreshToken);
    res.send(
      JSON.stringify({ success: true, token, expiresAt: decodedToken.exp, eventSlug: event.slug })
    );
  } catch (error) {
    console.error('Shortlink login error:', error.message);
    return fail();
  }
}
