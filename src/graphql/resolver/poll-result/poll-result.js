import { findByPollResultId } from "../../../repository/poll/poll-answer-repository";
import { findByEventId } from "../../../repository/poll/poll-user-repository";
import { findOneById } from "../../../repository/poll/poll-repository";

export function pollTypeConverter(typeId) {
  switch (typeId) {
    case 0:
      return "SECRET";
    case 1:
      return "PUBLIC";
    default:
      throw new Error(`the given type id "${typeId}" is not supported!`);
  }
}
export function pollTypeConverterToString(typeString) {
  switch (typeString) {
    case "SECRET":
      return 0;
    case "PUBLIC":
      return 1;
    default:
      throw new Error(`the given type id "${typeString}" is not supported!`);
  }
}
export default {
  type: ({ type }) => {
    return pollTypeConverter(type);
  },
  poll: async ({ pollId }) => {
    return await findOneById(pollId);
  },
  pollUser: async ({ pollId }) => {
    return await findByEventId(pollId);
  },
  pollAnswer: async ({ id }) => {
    return await findByPollResultId(id);
  },
};
