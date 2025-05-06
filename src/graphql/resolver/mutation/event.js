import {
  create,
  update,
  findOneBySlug,
  remove,
  findById,
  transferToOrganizer,
  resetToOriginalOrganizer,
} from "../../../repository/event-repository";
import SlugAlreadyExistsError from "../../../errors/event/SlugAlreadyExistsError";
import EventNotFoundError from "../../../errors/event/EventNotFoundError";

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
  transferEvent: async (_, { eventId, newOrganizerId }) => {
    const event = await findById(eventId);
    if (!event) {
      throw new EventNotFoundError();
    }

    return await transferToOrganizer(eventId, newOrganizerId);
  },
  resetEventOrganizer: async (_, { eventId }) => {
    const event = await findById(eventId);
    if (!event) {
      throw new EventNotFoundError();
    }

    if (!event.originalOrganizerId) {
      throw new Error('No original organizer exists for this event');
    }

    return await resetToOriginalOrganizer(eventId);
  },
};
