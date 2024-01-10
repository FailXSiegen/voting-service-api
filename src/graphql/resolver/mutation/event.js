import {
  create,
  update,
  findOneBySlug,
  remove,
} from "../../../repository/event-repository";
import SlugAlreadyExistsError from "../../../errors/event/SlugAlreadyExistsError";

export default {
  createEvent: async (_, { input }) => {
    const existingEvent = await findOneBySlug(input.slug);
    if (existingEvent) {
      throw new SlugAlreadyExistsError();
    }

    await create(input);
    return await findOneBySlug(input.slug);
  },
  updateEvent: async (_, { input }) => {
    const existingEvent = await findOneBySlug(input.slug);
    if (existingEvent && parseInt(existingEvent.id) !== parseInt(input.id)) {
      throw new SlugAlreadyExistsError();
    }
    await update(input);
    return await findOneBySlug(input.slug);
  },
  updateEventStatus: async (_, { input }) => {
    await update(input);
    return true;
  },
  removeEvent: async (_, { organizerId, id }) => {
    return await remove(organizerId, id);
  },
};
