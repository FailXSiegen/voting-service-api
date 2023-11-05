import { findByOrganizer } from "../../../repository/event-repository";

export default {
  events: async ({ id }) => {
    return await findByOrganizer(id);
  },
};
