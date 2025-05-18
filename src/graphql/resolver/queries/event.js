import {
  findById,
  findByIdAndOrganizerId,
  findByIdAndOrganizerIdIncludingOriginal,
  findExpired,
  findUpcoming,
  findAllUpcomingEvents,
  findAllPastEvents,
  findUpcomingByOriginalOrganizer,
  findExpiredByOriginalOrganizer,
} from "../../../repository/event-repository";
import EventNotFoundError from "../../../errors/event/EventNotFoundError";

export default {
  allUpcomingEvents: async () => {
    try {
      return await findAllUpcomingEvents() || [];
    } catch (err) {
      return [];
    }
  },
  allPastEvents: async (_, { page = 0, pageSize = 10 }) => {
    try {
      return await findAllPastEvents(page, pageSize) || [];
    } catch (err) {
      return [];
    }
  },
  upcomingEvents: async (_, args) => {
    try {
      // If no organizerId provided, return empty array
      if (!args || !args.organizerId) {
        return [];
      }

      // Get events directly owned by the organizer
      const directEvents = await findUpcoming(args.organizerId) || [];

      // Get events where this organizer is the original_organizer
      const originalEvents = await findUpcomingByOriginalOrganizer(args.organizerId) || [];

      // Combine both types of events
      return [...directEvents, ...originalEvents];
    } catch (err) {
      console.error("Error in upcomingEvents query:", err);
      return [];
    }
  },
  expiredEvents: async (_, args) => {
    try {
      // If no organizerId provided, return empty array
      if (!args || !args.organizerId) {
        return [];
      }

      // Get events directly owned by the organizer
      const directEvents = await findExpired(args.organizerId) || [];

      // Get events where this organizer is the original_organizer
      const originalEvents = await findExpiredByOriginalOrganizer(args.organizerId) || [];

      // Combine both types of events
      return [...directEvents, ...originalEvents];
    } catch (err) {
      console.error("Error in expiredEvents query:", err);
      return [];
    }
  },
  event: async (_, { id, organizerId }) => {
    try {
      // First try to find the event with the current organizer or as original organizer
      const event = await findByIdAndOrganizerIdIncludingOriginal(id, organizerId);
      if (!event) {
        throw new EventNotFoundError();
      }
      return event;
    } catch (err) {
      if (err instanceof EventNotFoundError) {
        throw err;
      }
      console.error("Error in event query:", err);
      return null;
    }
  },
};