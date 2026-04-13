import { findOneById } from '../../../repository/meeting/jitsi-meeting-repository';

export default {
  jitsiMeeting: async (_, { id }) => {
    return await findOneById(id);
  },
};
