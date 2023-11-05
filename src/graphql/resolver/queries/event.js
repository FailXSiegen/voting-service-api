import {
  findExpired,
  findUpcoming,
  findAllUpcomingEvents,
  findAllPastEvents,
  findById,
} from "../../../repository/event-repository";

export default {
  event: async (_, { id, organizerId }, context) => {
    return await findById(id, organizerId);
  },
  upcomingEvents: async (_, args, context) => {
    return await findUpcoming(args.organizerId);
  },
  expiredEvents: async (_, args, context) => {
    return await findExpired(args.organizerId);
  },
  allUpcomingEvents: async (_, args, context) => {
    return await findAllUpcomingEvents();
  },
  allPastEvents: async (_, { page, pageSize }, context) => {
    return await findAllPastEvents(page, pageSize);
  },
};
