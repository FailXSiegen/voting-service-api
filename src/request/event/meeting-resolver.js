import { VideoConferenceType } from '../../enum';
import { findOneById as findOneZoomMeetingById } from '../../repository/meeting/zoom-meeting-repository';
import { findOneById as findOneJitsiMeetingById } from '../../repository/meeting/jitsi-meeting-repository';

export default async function (event) {
  if (!event.videoConferenceConfig) {
    return event;
  }
  const config = JSON.parse(event.videoConferenceConfig);
  switch (config.type) {
    case VideoConferenceType.ZOOM:
      return await resolveZoomMeeting(event, config);
    case VideoConferenceType.JITSI:
      return await resolveJitsiMeeting(event, config);
    default:
      return event;
  }
}

async function resolveZoomMeeting(event, config) {
  event.meeting = await findOneZoomMeetingById(config.id);
  if (!event.meeting) return event;
  // SEC-17: SDK-Secret/-Key verlassen den Server nie (Signatur über /zoom/auth/token).
  delete event.meeting.sdkSecret;
  delete event.meeting.sdkKey;
  event.meeting.credentials = config.credentials;

  return event;
}

async function resolveJitsiMeeting(event, config) {
  event.meeting = await findOneJitsiMeetingById(config.id);
  if (!event.meeting) return event;
  event.meeting.credentials = config.credentials;
  event.meeting.type = VideoConferenceType.JITSI;

  return event;
}
