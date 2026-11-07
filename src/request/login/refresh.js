import { fetchRefreshToken } from '../../auth/login/refresh-token';
import { signSession, setRefreshCookie } from '../../auth/login/session';
import { findOneById as findOrganizerById } from '../../repository/organizer-repository';
import { findOneById as findEventUserById } from '../../repository/event-user-repository';

const noSession = (res) => res.status(200).send(JSON.stringify({ success: false }));

// SEC-14: Datensatz per Platzhalter, Nutzer aus der DB statt "id: undefined".
// Das Refresh-Token wird nicht rotiert: parallele Refreshs (mehrere Requests nach Ablauf des
// 15-min-JWT) würden sich sonst gegenseitig das Cookie ungültig machen und den Nutzer abmelden.
export default async function loginRefreshRequest(req, res) {
  res.setHeader('content-type', 'application/json');
  try {
    const refreshToken = req.signedCookies?.refreshToken;
    const tokenRecord = await fetchRefreshToken(refreshToken);
    if (!tokenRecord) return noSession(res);

    let type;
    let record;
    if (tokenRecord.organizerId) {
      type = 'organizer';
      record = await findOrganizerById(tokenRecord.organizerId);
      if (!record?.verified) return noSession(res);
    } else {
      type = 'event-user';
      record = tokenRecord.eventUserId ? await findEventUserById(tokenRecord.eventUserId) : null;
      if (!record) return noSession(res);
    }

    const { token, decodedToken } = await signSession(type, record);
    res.status(201);
    // Cookie neu setzen (aktuelle Flags); gültig bleibt es nur 30 Tage ab Login (create_datetime).
    setRefreshCookie(res, refreshToken);
    res.send(JSON.stringify({ token, expiresAt: decodedToken.exp }));
  } catch (error) {
    console.error('Refresh error:', error.message);
    return noSession(res);
  }
}
