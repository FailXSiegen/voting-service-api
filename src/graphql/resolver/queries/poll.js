import {
  findPollsWithNoResults,
  findOneById,
  findPollsByEventId,
} from "../../../repository/poll/poll-repository";
import { isAsyncEventStarted } from "../../../repository/event-repository";

export default {
  poll: async (_, { id }) => {
    return await findOneById(id);
  },
  pollsWithNoResults: async (_, { eventId }, context) => {
    // Organizers können immer alle Polls sehen, auch vor dem Start von async Events
    const isOrganizer = context?.user?.type === 'organizer';
    
    if (!isOrganizer) {
      // Nur für Event-User: Prüfe ob asynchrone Events gestartet sind
      const canShowPolls = await isAsyncEventStarted(eventId);
      if (!canShowPolls) {
        return []; // Keine Polls für noch nicht gestartete async Events
      }
    }
    
    return await findPollsWithNoResults(eventId);
  },
  polls: async (_, { eventId }, context) => {
    // Organizers können immer alle Polls sehen, auch vor dem Start von async Events
    const isOrganizer = context?.user?.type === 'organizer';
    
    if (!isOrganizer) {
      // Nur für Event-User: Prüfe ob asynchrone Events gestartet sind
      const canShowPolls = await isAsyncEventStarted(eventId);
      if (!canShowPolls) {
        return []; // Keine Polls für noch nicht gestartete async Events
      }
    }
    
    return await findPollsByEventId(eventId);
  },
};
