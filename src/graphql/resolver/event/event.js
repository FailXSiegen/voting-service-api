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
  zoomMeeting: async ({ videoConferenceConfig }) => {
    if (typeof videoConferenceConfig !== 'string' || videoConferenceConfig.length === 0) {
      return null
    }

    const config = JSON.parse(videoConferenceConfig)

    if (typeof config.id !== 'number') {
      return null
    }

    if (config.type !== VideoConferenceType.ZOOM) {
      return null
    }

    const record = await findOneZoomMeetingById(config.id)

    if (record === null) {
      return null
    }

    record.meetingId = config.credentials.id ?? ''
    record.meetingPassword = config.credentials.password ?? ''

    return record
  }
}
