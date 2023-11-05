import { VideoConferenceType } from "../../enum";
import { findOneById as findOneZoomMeetingById } from "../../repository/meeting/zoom-meeting-repository";

export default async function (event) {
  if (!event.videoConferenceConfig) {
    return event;
  }
  const config = JSON.parse(event.videoConferenceConfig);
  switch (config.type) {
    case VideoConferenceType.ZOOM:
      return await resolveZoomMeeting(event, config);
    default:
      return event;
  }
}

async function resolveZoomMeeting(event, config) {
  event.meeting = await findOneZoomMeetingById(config.id);
  event.meeting.credentials = config.credentials;

  return event;
}
