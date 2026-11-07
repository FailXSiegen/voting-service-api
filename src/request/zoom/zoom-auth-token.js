import * as jwt from 'jsonwebtoken';
import { findById as findOneEventById } from '../../repository/event-repository';
import { findOneById as findOneZoomMeetingById } from '../../repository/meeting/zoom-meeting-repository';
import { VideoConferenceType } from '../../enum';

// SEC-19: Nutzer aus dem verifizierten JWT (authenticate.js setzt req.user samt eventId aus der DB),
// Event und Meeting serverseitig, Rolle immer Teilnehmer (0).
// SEC-41: Meeting-Nummer und Passwort kommen mit, damit der Client sie nicht im Cookie halten muss.
export default async function zoomAuthToken(req, res) {
  try {
    if (req.user?.type !== 'event-user' || !req.user.eventId) {
      return res.status(403).json({ success: false, error: 'Not authorized.' });
    }
    const event = await findOneEventById(req.user.eventId);
    const config = event?.videoConferenceConfig ? JSON.parse(event.videoConferenceConfig) : null;
    if (!config || Number(config.type) !== VideoConferenceType.ZOOM) {
      return res.status(404).json({ success: false, error: 'No zoom meeting.' });
    }
    const meeting = await findOneZoomMeetingById(config.id);
    if (!meeting?.sdkKey || !meeting?.sdkSecret) {
      return res.status(404).json({ success: false, error: 'No zoom meeting.' });
    }
    const meetingNumber = String(config.credentials?.meetingId ?? config.credentials?.id ?? '');

    const iat = Math.round(Date.now() / 1000) - 30;
    const exp = iat + 60 * 60 * 2;
    const signature = jwt.sign(
      {
        sdkKey: meeting.sdkKey,
        appKey: meeting.sdkKey,
        mn: meetingNumber,
        role: 0,
        iat,
        exp,
        tokenExp: exp,
      },
      meeting.sdkSecret,
      { algorithm: 'HS256' }
    );

    res.json({
      success: true,
      signature,
      meetingNumber,
      password: config.credentials?.password ?? '',
    });
  } catch (error) {
    console.error('zoom auth token:', error.message);
    res.status(500).json({ success: false });
  }
}
