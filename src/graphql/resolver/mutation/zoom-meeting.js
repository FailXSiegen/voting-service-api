import {
  remove,
  update,
  create as createZoomMeeting,
  findOneById,
} from "../../../repository/meeting/zoom-meeting-repository";
import RecordNotFoundError from "../../../errors/RecordNotFoundError";

export default {
  createZoomMeeting: async (_, { input }) => {
    return await createZoomMeeting(input);
  },
  updateZoomMeeting: async (_, { input }) => {
    const id = input.id;
    const existingMeeting = await findOneById(id);
    if (!existingMeeting) {
      throw new RecordNotFoundError();
    }
    await update(input);
    return await findOneById(id);
  },
  deleteZoomMeeting: async (_, { id }) => {
    return await remove(id);
  },
};
