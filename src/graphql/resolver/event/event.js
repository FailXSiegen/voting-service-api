import { findOneById } from "../../../repository/organizer-repository";
import { findOneById as findOneZoomMeetingById } from "../../../repository/meeting/zoom-meeting-repository";
import { VideoConferenceType } from "../../../enum";

export default {
  organizer: async ({ organizerId }) => {
    return await findOneById(organizerId);
  },
  originalOrganizer: async ({ originalOrganizerId }) => {
    if (!originalOrganizerId) {
      return null;
    }
    return await findOneById(originalOrganizerId);
  },
  lobbyOpen: async ({ lobbyOpen }) => {
    return lobbyOpen === 1 || lobbyOpen === true;
  },
  active: async ({ active }) => {
    return active === 1 || active === true;
  },
  multivoteType: async ({ multivoteType }) => {
    return parseInt(multivoteType);
  },
  zoomMeeting: async ({ videoConferenceConfig }) => {
    if (
      typeof videoConferenceConfig !== "string" ||
      videoConferenceConfig.length === 0
    ) {
      return null;
    }

    const config = JSON.parse(videoConferenceConfig);

    if (!config?.id || !config?.type) {
      return null;
    }

    config.id = parseInt(config.id, 10);
    config.type = parseInt(config.type, 10);

    if (config.type !== VideoConferenceType.ZOOM) {
      return null;
    }

    const record = await findOneZoomMeetingById(config.id);

    if (record === null) {
      return null;
    }

    record.meetingId = config.credentials.id ?? "";
    record.meetingPassword = config.credentials.password ?? "";

    return record;
  },
};
