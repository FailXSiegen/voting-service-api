import { findOneById } from "../../../repository/meeting/zoom-meeting-repository";

export default {
  zoomMeeting: async (_, { id }) => {
    return await findOneById(id);
  },
};
