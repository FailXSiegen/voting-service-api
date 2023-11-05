import {
  findOrganizers,
  findOneById,
} from "../../../repository/organizer-repository";

export default {
  organizer: async (_, { organizerId }, context) => {
    return await findOneById(organizerId);
  },
  organizers: async (_, args, context) => {
    return await findOrganizers();
  },
};
