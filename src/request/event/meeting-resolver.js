import { VideoConferenceType } from '../../enum'
import { findOneById as findOneZoomMeetingById } from '../../repository/meeting/zoom-meeting-repository'

export default async function (event) {
  switch (event.meetingType) {
    case VideoConferenceType.ZOOM:
      return await resolveZoomMeeting(event)
    default:
      return event
  }
}

async function resolveZoomMeeting (event) {
  event.meeting = await findOneZoomMeetingById(event.meetingId)
  return event
}
