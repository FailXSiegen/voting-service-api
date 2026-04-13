import {
  remove,
  update,
  create as createJitsiMeeting,
  findOneById,
} from '../../../repository/meeting/jitsi-meeting-repository';
import RecordNotFoundError from '../../../errors/RecordNotFoundError';

export default {
  createJitsiMeeting: async (_, { input }) => {
    return await createJitsiMeeting(input);
  },
  updateJitsiMeeting: async (_, { input }) => {
    const id = input.id;
    const existingMeeting = await findOneById(id);
    if (!existingMeeting) {
      throw new RecordNotFoundError();
    }
    await update(input);
    return await findOneById(id);
  },
  deleteJitsiMeeting: async (_, { id }) => {
    return await remove(id);
  },
};
