import {
  findExpired,
  findUpcoming,
  findAllUpcomingEvents,
  findAllPastEvents,
  findByIdAndOrganizerId,
} from "../../../repository/event-repository";

export default {
  event: async (_, { id, organizerId }) => {
    return await findByIdAndOrganizerId(id, organizerId);
  },
  upcomingEvents: async (_, args) => {
    return await findUpcoming(args.organizerId);
  },
  expiredEvents: async (_, args) => {
    return await findExpired(args.organizerId);
  },
  allUpcomingEvents: async () => {
    return await findAllUpcomingEvents();
  },
  allPastEvents: async (_, { page, pageSize }) => {
    return await findAllPastEvents(page, pageSize);
  },
};
