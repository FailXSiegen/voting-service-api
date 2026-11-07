import {
  findOneByEventUserId,
  remove as removeEventUSerAuthToken,
} from '../../../repository/event-user-auth-token-repository';
import {
  findOneById,
  findOneByUsernameAndEventId,
  update,
  create,
  remove,
} from '../../../repository/event-user-repository';
import { pubsub } from '../../../server/graphql';
import {
  UPDATE_EVENT_USER_ACCESS_RIGHTS,
  NEW_EVENT_USER,
  TOKEN_REFRESH_REQUIRED,
} from '../subscription/subscription-types';
import { refreshUserJwtAfterVerification } from '../../../lib/jwt-auth';
import { query } from '../../../lib/database';

/**
 * SEC-29: Stimmgewicht eines Wählers ist eingefroren, sobald er in einer laufenden Abstimmung
 * abgestimmt hat (sonst passen vote_cycle, Kontingent und Ergebnis nicht mehr zusammen).
 * Stimmübertragungen (transferVotes) prüfen das Restkontingent selbst.
 */
async function assertVoteAmountChangeable(eventUser, newVoteAmount) {
  if (newVoteAmount === undefined || Number(newVoteAmount) === Number(eventUser.voteAmount)) {
    return;
  }
  const voted = await query(
    `SELECT 1 FROM poll_user_voted puv
     INNER JOIN poll_result pr ON pr.id = puv.poll_result_id
     WHERE puv.event_user_id = ? AND pr.closed = 0 AND puv.vote_cycle > 0
     LIMIT 1`,
    [eventUser.id],
    { throwError: true }
  );
  if (Array.isArray(voted) && voted.length > 0) {
    throw new Error(
      'Das Stimmgewicht kann erst nach Ende der laufenden Abstimmung geändert werden, da bereits abgestimmt wurde.'
    );
  }
}

export default {
  createEventUser: async (_, args) => {
    const eventUser = await findOneByUsernameAndEventId(args.input.username, args.input.eventId);
    if (eventUser) {
      throw new Error('EventUser already exists');
    }
    await create(args.input);
    const newEventUser = await findOneByUsernameAndEventId(args.input.username, args.input.eventId);
    pubsub.publish(NEW_EVENT_USER, { ...newEventUser }, { priority: true });
    return newEventUser;
  },
  updateEventUser: async (_, { input }) => {
    let eventUser = await findOneById(input.id);
    if (!eventUser) {
      throw new Error('EventUser not found');
    }

    // Check if verification status is changing
    const verificationChanged =
      input.verified !== undefined && Boolean(eventUser.verified) !== Boolean(input.verified);
    const previousVerificationStatus = eventUser.verified;

    await assertVoteAmountChangeable(eventUser, input.voteAmount);
    await update(input);
    eventUser = await findOneById(input.id);

    // Publish normal update
    pubsub.publish(
      UPDATE_EVENT_USER_ACCESS_RIGHTS,
      {
        eventId: eventUser.eventId,
        eventUserId: eventUser.id,
        verified: eventUser.verified,
        allowToVote: eventUser.allowToVote,
        voteAmount: eventUser.voteAmount,
      },
      { priority: true }
    );

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
        pubsub.publish(
          TOKEN_REFRESH_REQUIRED,
          {
            eventUserId: eventUser.id,
            userId: eventUser.id,
            userType: 'event-user',
            token: newToken,
            reason: 'verification_change',
            previousVerificationStatus,
            currentVerificationStatus: eventUser.verified,
          },
          { priority: true }
        );
      } catch (error) {
        console.error(`[ERROR] Failed to generate refresh token for user ${eventUser.id}:`, error);
      }
    }

    return eventUser;
  },
  updateUserToGuest: async (_, { eventUserId }) => {
    const eventUser = await findOneById(eventUserId);
    if (!eventUser) {
      throw new Error('EventUser not found');
    }

    // Check if verification status is changing
    const verificationChanged = !eventUser.verified;
    const previousVerificationStatus = eventUser.verified;

    await assertVoteAmountChangeable(eventUser, 0);

    // Define guest access rights.
    eventUser.verified = true;
    eventUser.allowToVote = false;
    eventUser.voteAmount = 0;
    delete eventUser.password;
    await update(eventUser);

    // Publish normal update
    pubsub.publish(
      UPDATE_EVENT_USER_ACCESS_RIGHTS,
      {
        eventId: eventUser.eventId,
        eventUserId: eventUser.id,
        verified: eventUser.verified,
        allowToVote: eventUser.allowToVote,
        voteAmount: eventUser.voteAmount,
      },
      { priority: true }
    );

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
        pubsub.publish(
          TOKEN_REFRESH_REQUIRED,
          {
            eventUserId: eventUser.id,
            userId: eventUser.id,
            userType: 'event-user',
            token: newToken,
            reason: 'verification_change',
            previousVerificationStatus,
            currentVerificationStatus: eventUser.verified,
          },
          { priority: true }
        );
      } catch (error) {
        console.error(
          `[ERROR] Failed to generate refresh token for guest user ${eventUser.id}:`,
          error
        );
      }
    }

    return eventUser;
  },
  updateUserToParticipant: async (_, { eventUserId }) => {
    const eventUser = await findOneById(eventUserId);
    if (!eventUser) {
      throw new Error('EventUser not found');
    }

    // Check if verification status is changing
    const verificationChanged = !eventUser.verified;
    const previousVerificationStatus = eventUser.verified;

    await assertVoteAmountChangeable(eventUser, 1);

    // Define participant access rights.
    eventUser.verified = true;
    eventUser.allowToVote = true;
    eventUser.voteAmount = 1;
    delete eventUser.password;
    await update(eventUser);

    // Publish normal update
    pubsub.publish(
      UPDATE_EVENT_USER_ACCESS_RIGHTS,
      {
        eventId: eventUser.eventId,
        eventUserId: eventUser.id,
        verified: eventUser.verified,
        allowToVote: eventUser.allowToVote,
        voteAmount: eventUser.voteAmount,
      },
      { priority: true }
    );

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
        pubsub.publish(
          TOKEN_REFRESH_REQUIRED,
          {
            eventUserId: eventUser.id,
            userId: eventUser.id,
            userType: 'event-user',
            token: newToken,
            reason: 'verification_change',
            previousVerificationStatus,
            currentVerificationStatus: eventUser.verified,
          },
          { priority: true }
        );
      } catch (error) {
        console.error(
          `[ERROR] Failed to generate refresh token for participant user ${eventUser.id}:`,
          error
        );
      }
    }

    return eventUser;
  },
  deleteEventUser: async (_, { eventUserId }) => {
    const existingUser = await findOneById(eventUserId);
    if (!existingUser) {
      throw new Error('EventUser not found');
    }

    const eventUserAuthToken = await findOneByEventUserId(existingUser.id);
    if (eventUserAuthToken) {
      await removeEventUSerAuthToken(eventUserAuthToken.id);
    }

    return await remove(parseInt(eventUserId));
  },
};
