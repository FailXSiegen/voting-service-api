import {
  findOneByUsernameAndEventId,
  findOneById,
  create,
  update,
} from "../../repository/event-user-repository";
import { generateJwt } from "../../lib/jwt-auth";
import * as jwt from "jsonwebtoken";
import { addRefreshToken } from "./refresh-token";
import { verify } from "../../lib/crypto";
import AuthenticationError from "../../errors/AuthenticationError";
import { findById as findOneEventById } from "../../repository/event-repository";
import { pubsub } from "../../server/graphql";
import {
  EVENT_USER_LIFE_CYCLE,
  NEW_EVENT_USER,
  POLL_ANSWER_LIFE_CYCLE
} from "../../graphql/resolver/subscription/subscription-types";
import { InactiveEventLoginError } from "../../errors/event/InactiveEventLoginError";
import { EventNotFoundError } from "../../errors/event/EventNotFoundError";
import { InvalidAnonymousLoginError } from "../../errors/event/InvalidAnonymousLoginError";
import { findActivePoll, findLeftAnswersCount } from "../../repository/poll/poll-result-repository";
import { createPollUserIfNeeded } from "../../service/poll-service";

async function buildNewEventUserObject(
  username,
  password,
  email,
  displayName,
  eventId,
) {
  return {
    username,
    password,
    email: typeof email === "string" ? email : "",
    publicName: displayName,
    allowToVote: false,
    online: true,
    coorganizer: false,
    verified: false,
    eventId,
  };
}

export async function loginEventUser({
  username,
  password,
  email,
  displayName,
  eventId,
}) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEBUG] login-event-user.js - Login attempt:', {
      username,
      eventId,
      displayName
    });
  }
  const event = await findOneEventById(eventId);
  if (!event) {
    throw new EventNotFoundError();
  }

  if (!event?.active) {
    throw new InactiveEventLoginError();
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
      await buildNewEventUserObject(
        username,
        password,
        email,
        displayName,
        eventId,
      ),
    );
    // Fetch newly created event user.
    eventUser = await findOneById(newEventUserId);
    if (eventUser === null) {
      throw new Error("Could not create new user!");
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] login-event-user.js - New user created:', {
        id: eventUser.id,
        eventId: eventUser.eventId,
        username: eventUser.username,
        verified: eventUser.verified
      });
    }

    // Notify subscribers for new event user.
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] login-event-user.js - Publishing NEW_EVENT_USER event for:', {
        eventId: eventUser.eventId,
        userId: eventUser.id,
        username: eventUser.username,
        verified: eventUser.verified
      });
    }
    
    pubsub.publish(NEW_EVENT_USER, {
      eventUser: eventUser,
      eventId: eventUser.eventId
    }, { priority: true });
  } else {
    let isAuthenticated = false;
    if (eventUser.password === "") {
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
      console.log('[DEBUG] login-event-user.js - Publishing EVENT_USER_LIFE_CYCLE for existing user:', {
        eventId: eventId,
        userId: eventUser.id,
        online: true
      });
    }
    
    pubsub.publish(EVENT_USER_LIFE_CYCLE, {
      online: true,
      eventUserId: eventUser.id,
      eventId: eventId
    }, { priority: true });
  }

  // Update user as online.
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEBUG] login-event-user.js - Updating user online status:', {
      userId: eventUser.id,
      eventId: eventUser.eventId,
      online: true
    });
  }
  await update({ id: eventUser.id, online: true });


  try {
    const activePollResult = await findActivePoll(eventId);

    if (activePollResult) {
      // Always attempt to add the user regardless of allowToVote status
      const addResult = await createPollUserIfNeeded(activePollResult.id, eventUser.id);

      // Publish updated poll information to all clients
      const leftAnswersDataSet = await findLeftAnswersCount(activePollResult.id);

      if (leftAnswersDataSet) {
        pubsub.publish(POLL_ANSWER_LIFE_CYCLE, {
          ...leftAnswersDataSet,
          eventId: eventId,
        });
      }
    }
  } catch (error) {
    console.error(`[ERROR] Error adding user to active poll: ${error.message}`);
    console.error(error.stack);
  }

  // Create jwt and refresh token.
  const refreshToken = await addRefreshToken("event-user", eventUser.id);
  const claims = {
    user: {
      id: eventUser.id,
      eventId,
      type: "event-user",
      verified: eventUser.verified,
    },
    role: "event-user",
    // Für WebSocket-Authentifizierung hinzufügen
    eventUserId: eventUser.id
  };
  const token = await generateJwt(claims);
  const decodedToken = await jwt.verify(token, process.env.JWT_SECRET);
  return { token, decodedToken, refreshToken };
}
