import {
  findOrganizers,
  findOneById,
} from "../../../repository/organizer-repository";

export default {
  organizer: async (_, { organizerId }) => {
    return await findOneById(organizerId);
  },
  organizers: async () => {
    return await findOrganizers();
  },
};
