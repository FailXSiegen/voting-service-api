import {
  findOneByUsernameAndEventId,
  findOneById,
  create,
  update,
  setEventUserOnline,
} from '../../repository/event-user-repository';
import { addRefreshToken } from './refresh-token';
import { signSession } from './session';
import { verify } from '../../lib/crypto';
import AuthenticationError from '../../errors/AuthenticationError';
import { findById as findOneEventById } from '../../repository/event-repository';
import { pubsub } from '../../server/graphql';
import {
  EVENT_USER_LIFE_CYCLE,
  NEW_EVENT_USER,
  POLL_ANSWER_LIFE_CYCLE,
} from '../../graphql/resolver/subscription/subscription-types';
import { InactiveEventLoginError } from '../../errors/event/InactiveEventLoginError';
import { EventNotFoundError } from '../../errors/event/EventNotFoundError';
import { InvalidAnonymousLoginError } from '../../errors/event/InvalidAnonymousLoginError';
import { findActivePoll, findLeftAnswersCount } from '../../repository/poll/poll-result-repository';
import { createPollUserIfNeeded } from '../../service/poll-service';

// MAGIC-1: Der alte Client leitete das Magic-Link-Passwort aus öffentlichen Daten ab
// (hashString(username + event.createDatetime), voting-service-client-v2/src/core/util/hashString.js).
// Dieses Passwort wird abgelehnt – Magic-Links laufen über POST /login/shortlink (Shortcode = Einmal-Token).
function legacyMagicLinkPassword(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function isDerivedMagicLinkPassword(password, rawUsername, event) {
  return [rawUsername, rawUsername.trim()].some(
    (name) => password === legacyMagicLinkPassword(name + event.createDatetime)
  );
}

async function buildNewEventUserObject(username, password, email, displayName, eventId) {
  return {
    username,
    password,
    email: typeof email === 'string' ? email : '',
    publicName: displayName,
    allowToVote: false,
    online: true,
    coorganizer: false,
    verified: false,
    eventId,
  };
}

export async function loginEventUser({ username, password, email, displayName, eventId }) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEBUG] login-event-user.js - Login attempt:', {
      username,
      eventId,
      displayName,
    });
  }
  // SEC-13/18: nur Strings, kein leeres Passwort (sonst bleibt das Konto per TOFU übernehmbar).
  if (typeof username !== 'string' || typeof password !== 'string' || password.length === 0) {
    throw new AuthenticationError();
  }
  if (displayName !== undefined && typeof displayName !== 'string') {
    throw new AuthenticationError();
  }
  const event = await findOneEventById(eventId);
  if (!event) {
    throw new EventNotFoundError();
  }

  if (!event?.active) {
    throw new InactiveEventLoginError();
  }

  if (isDerivedMagicLinkPassword(password, username, event)) {
    throw new AuthenticationError();
  }

  username = username.trim();
  let eventUser = await findOneByUsernameAndEventId(username, eventId);
  if (!eventUser) {
    if (!event?.lobbyOpen) {
      // Do not allow login for anonymous users, if the lobby is closed.
      throw new InvalidAnonymousLoginError();
    }

    // create new event user.
    const newEventUserId = await create(
      await buildNewEventUserObject(username, password, email, displayName, eventId)
    );
    // Fetch newly created event user.
    eventUser = await findOneById(newEventUserId);
    if (eventUser === null) {
      throw new Error('Could not create new user!');
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] login-event-user.js - New user created:', {
        id: eventUser.id,
        eventId: eventUser.eventId,
        username: eventUser.username,
        verified: eventUser.verified,
      });
    }

    // Notify subscribers for new event user.
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] login-event-user.js - Publishing NEW_EVENT_USER event for:', {
        eventId: eventUser.eventId,
        userId: eventUser.id,
        username: eventUser.username,
        verified: eventUser.verified,
      });
    }

    pubsub.publish(
      NEW_EVENT_USER,
      {
        eventUser: eventUser,
        eventId: eventUser.eventId,
      },
      { priority: true }
    );
  } else {
    let isAuthenticated = false;
    if (eventUser.password === '') {
      const eventUserPasswordUpdate = {
        id: eventUser.id,
        password: password,
      };
      await update(eventUserPasswordUpdate);
      isAuthenticated = true;
    } else {
      // Verify password.
      isAuthenticated = await verify(password, eventUser.password);
    }
    if (!isAuthenticated) {
      throw new AuthenticationError();
    }
    if (eventUser.publicName !== displayName) {
      // Update display name.
      eventUser.publicName = displayName;
      delete eventUser.password;
      await update(eventUser);
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[DEBUG] login-event-user.js - Publishing EVENT_USER_LIFE_CYCLE for existing user:',
        {
          eventId: eventId,
          userId: eventUser.id,
          online: true,
        }
      );
    }

    pubsub.publish(
      EVENT_USER_LIFE_CYCLE,
      {
        online: true,
        eventUserId: eventUser.id,
        eventId: eventId,
      },
      { priority: true }
    );
  }

  // Update user as online.
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEBUG] login-event-user.js - Updating user online status:', {
      userId: eventUser.id,
      eventId: eventUser.eventId,
      online: true,
    });
  }
  await setEventUserOnline(eventUser.id);

  try {
    const activePollResult = await findActivePoll(eventId);

    if (activePollResult) {
      // Always attempt to add the user regardless of allowToVote status
      await createPollUserIfNeeded(activePollResult.id, eventUser.id);

      // Publish updated poll information to all clients
      const leftAnswersDataSet = await findLeftAnswersCount(activePollResult.id);

      if (leftAnswersDataSet) {
        pubsub.publish(
          POLL_ANSWER_LIFE_CYCLE,
          {
            ...leftAnswersDataSet,
            eventId: eventId,
          },
          { filterBy: { eventId: eventId } }
        );
      }
    }
  } catch (error) {
    console.error(`[ERROR] Error adding user to active poll: ${error.message}`);
    console.error(error.stack);
  }

  // Create jwt and refresh token.
  const refreshToken = await addRefreshToken('event-user', eventUser.id);
  const { token, decodedToken } = await signSession('event-user', eventUser);
  return { token, decodedToken, refreshToken };
}
