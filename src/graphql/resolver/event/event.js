import { findOneById } from '../../../repository/organizer-repository'
import { findOneById as findOneZoomMeetingById } from '../../../repository/meeting/zoom-meeting-repository'
import { VideoConferenceType } from '../../../enum'

export default {
  organizer: async ({ organizerId }) => {
    return await findOneById(organizerId)
  },
  lobbyOpen: async ({ lobbyOpen }) => {
    return lobbyOpen === 1 || lobbyOpen === true
  },
  active: async ({ active }) => {
    return active === 1 || active === true
  },
  multivoteType: async ({ multivoteType }) => {
    return parseInt(multivoteType)
  },
  zoomMeeting: async ({ meetingId, meetingType }) => {
    if (!meetingId || meetingType !== VideoConferenceType.ZOOM) {
      return null
    }
    return await findOneZoomMeetingById(meetingId)
  }
}
