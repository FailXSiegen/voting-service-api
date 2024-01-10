import {
  findOneByEventUserId,
  remove as removeEventUSerAuthToken,
} from "../../../repository/event-user-auth-token-repository";
import {
  findOneById,
  findOneByUsernameAndEventId,
  update,
  create,
  remove,
} from "../../../repository/event-user-repository";
import { pubsub } from "../../../server/graphql";
import {
  UPDATE_EVENT_USER_ACCESS_RIGHTS,
  NEW_EVENT_USER,
} from "../subscription/subscription-types";

export default {
  createEventUser: async (_, args) => {
    const eventUser = await findOneByUsernameAndEventId(
      args.input.username,
      args.input.eventId,
    );
    if (eventUser) {
      throw new Error("EventUser already exists");
    }
    await create(args.input);
    const newEventUser = await findOneByUsernameAndEventId(
      args.input.username,
      args.input.eventId,
    );
    pubsub.publish(NEW_EVENT_USER, { ...newEventUser });
    return newEventUser;
  },
  updateEventUser: async (_, { input }) => {
    let eventUser = await findOneById(input.id);
    if (!eventUser) {
      throw new Error("EventUser not found");
    }
    await update(input);
    eventUser = await findOneById(input.id);
    pubsub.publish(UPDATE_EVENT_USER_ACCESS_RIGHTS, {
      eventId: eventUser.eventId,
      eventUserId: eventUser.id,
      verified: eventUser.verified,
      allowToVote: eventUser.allowToVote,
      voteAmount: eventUser.voteAmount,
    });
    return eventUser;
  },
  updateUserToGuest: async (_, { eventUserId }) => {
    const eventUser = await findOneById(eventUserId);
    if (!eventUser) {
      throw new Error("EventUser not found");
    }
    // Define guest access rights.
    eventUser.verified = true;
    eventUser.allowToVote = false;
    eventUser.voteAmount = 0;
    delete eventUser.password;
    await update(eventUser);
    pubsub.publish(UPDATE_EVENT_USER_ACCESS_RIGHTS, {
      eventId: eventUser.eventId,
      eventUserId: eventUser.id,
      verified: eventUser.verified,
      allowToVote: eventUser.allowToVote,
      voteAmount: eventUser.voteAmount,
    });
    return eventUser;
  },
  updateUserToParticipant: async (_, { eventUserId }) => {
    const eventUser = await findOneById(eventUserId);
    if (!eventUser) {
      throw new Error("EventUser not found");
    }
    // Define participant access rights.
    eventUser.verified = true;
    eventUser.allowToVote = true;
    eventUser.voteAmount = 1;
    delete eventUser.password;
    await update(eventUser);
    pubsub.publish(UPDATE_EVENT_USER_ACCESS_RIGHTS, {
      eventId: eventUser.eventId,
      eventUserId: eventUser.id,
      verified: eventUser.verified,
      allowToVote: eventUser.allowToVote,
      voteAmount: eventUser.voteAmount,
    });
    return eventUser;
  },
  deleteEventUser: async (_, { eventUserId }) => {
    const existingUser = await findOneById(eventUserId);
    if (!existingUser) {
      throw new Error("EventUser not found");
    }

    const eventUserAuthToken = await findOneByEventUserId(existingUser.id);
    if (eventUserAuthToken) {
      await removeEventUSerAuthToken(eventUserAuthToken.id);
    }

    return await remove(parseInt(eventUserId));
  },
};
