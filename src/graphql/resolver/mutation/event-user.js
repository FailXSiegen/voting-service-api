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
  TOKEN_REFRESH_REQUIRED,
} from "../subscription/subscription-types";
import { refreshUserJwtAfterVerification } from "../../../lib/jwt-auth";

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
    pubsub.publish(NEW_EVENT_USER, { ...newEventUser }, { priority: true });
    return newEventUser;
  },
  updateEventUser: async (_, { input }) => {
    let eventUser = await findOneById(input.id);
    if (!eventUser) {
      throw new Error("EventUser not found");
    }

    // Check if verification status is changing
    const verificationChanged = input.verified !== undefined && eventUser.verified !== input.verified;
    const previousVerificationStatus = eventUser.verified;

    await update(input);
    eventUser = await findOneById(input.id);

    // Publish normal update
    pubsub.publish(UPDATE_EVENT_USER_ACCESS_RIGHTS, {
      eventId: eventUser.eventId,
      eventUserId: eventUser.id,
      verified: eventUser.verified,
      allowToVote: eventUser.allowToVote,
      voteAmount: eventUser.voteAmount,
    });

    // If verified status changed, generate new token and publish refresh notification
    if (verificationChanged) {
      try {
        // Generate fresh token with updated verification status
        const newToken = await refreshUserJwtAfterVerification(
          eventUser.id,
          eventUser.eventId,
          eventUser.verified
        );

        // Publish token refresh event with fields matching client expectations
        pubsub.publish(TOKEN_REFRESH_REQUIRED, {
          eventUserId: eventUser.id,
          userId: eventUser.id,
          userType: "event-user",
          token: newToken,
          reason: "verification_change",
          previousVerificationStatus,
          currentVerificationStatus: eventUser.verified
        });

      } catch (error) {
        console.error(`[ERROR] Failed to generate refresh token for user ${eventUser.id}:`, error);
      }
    }

    return eventUser;
  },
  updateUserToGuest: async (_, { eventUserId }) => {
    const eventUser = await findOneById(eventUserId);
    if (!eventUser) {
      throw new Error("EventUser not found");
    }

    // Check if verification status is changing
    const verificationChanged = !eventUser.verified;
    const previousVerificationStatus = eventUser.verified;

    // Define guest access rights.
    eventUser.verified = true;
    eventUser.allowToVote = false;
    eventUser.voteAmount = 0;
    delete eventUser.password;
    await update(eventUser);

    // Publish normal update
    pubsub.publish(UPDATE_EVENT_USER_ACCESS_RIGHTS, {
      eventId: eventUser.eventId,
      eventUserId: eventUser.id,
      verified: eventUser.verified,
      allowToVote: eventUser.allowToVote,
      voteAmount: eventUser.voteAmount,
    });

    // If verified status changed, generate new token and publish refresh notification
    if (verificationChanged) {
      try {
        // Generate fresh token with updated verification status
        const newToken = await refreshUserJwtAfterVerification(
          eventUser.id,
          eventUser.eventId,
          eventUser.verified
        );

        // Publish token refresh event with fields matching client expectations
        pubsub.publish(TOKEN_REFRESH_REQUIRED, {
          eventUserId: eventUser.id,
          userId: eventUser.id,
          userType: "event-user",
          token: newToken,
          reason: "verification_change",
          previousVerificationStatus,
          currentVerificationStatus: eventUser.verified
        });

      } catch (error) {
        console.error(`[ERROR] Failed to generate refresh token for guest user ${eventUser.id}:`, error);
      }
    }

    return eventUser;
  },
  updateUserToParticipant: async (_, { eventUserId }) => {
    const eventUser = await findOneById(eventUserId);
    if (!eventUser) {
      throw new Error("EventUser not found");
    }

    // Check if verification status is changing
    const verificationChanged = !eventUser.verified;
    const previousVerificationStatus = eventUser.verified;

    // Define participant access rights.
    eventUser.verified = true;
    eventUser.allowToVote = true;
    eventUser.voteAmount = 1;
    delete eventUser.password;
    await update(eventUser);

    // Publish normal update
    pubsub.publish(UPDATE_EVENT_USER_ACCESS_RIGHTS, {
      eventId: eventUser.eventId,
      eventUserId: eventUser.id,
      verified: eventUser.verified,
      allowToVote: eventUser.allowToVote,
      voteAmount: eventUser.voteAmount,
    });

    // If verified status changed, generate new token and publish refresh notification
    if (verificationChanged) {
      try {
        // Generate fresh token with updated verification status
        const newToken = await refreshUserJwtAfterVerification(
          eventUser.id,
          eventUser.eventId,
          eventUser.verified
        );

        // Publish token refresh event with fields matching client expectations
        pubsub.publish(TOKEN_REFRESH_REQUIRED, {
          eventUserId: eventUser.id,
          userId: eventUser.id,
          userType: "event-user",
          token: newToken,
          reason: "verification_change",
          previousVerificationStatus,
          currentVerificationStatus: eventUser.verified
        });

      } catch (error) {
        console.error(`[ERROR] Failed to generate refresh token for participant user ${eventUser.id}:`, error);
      }
    }

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
