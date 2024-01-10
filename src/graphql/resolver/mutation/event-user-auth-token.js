import { v4 as uuidv4 } from "uuid";
import { create } from "../../../repository/event-user-auth-token-repository";
import { create as createEventUser } from "../../../repository/event-user-repository";
import { findById } from "../../../repository/event-repository";
import { emailTokenToEventUser } from "../../../lib/event-user/email-service";

export default {
  createEventUserAuthToken: async (_, { input }) => {
    try {
      const { email, eventId, allowToVote, verified, voteAmount } = input;
      const token = uuidv4();
      const event = await findById(eventId);
      if (event === null) {
        throw Error(`Event with id ${eventId} does not exist or is deleted.`);
      }
      const eventUserId = await createEventUser({
        email,
        eventId,
        allowToVote,
        verified,
        voteAmount,
      });
      await create(token, eventUserId);
      await emailTokenToEventUser(email, token, event);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  },
};
