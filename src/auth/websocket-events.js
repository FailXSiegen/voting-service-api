import { GraphQLError, getOperationAST } from 'graphql';
import { findActivePoll, findLeftAnswersCount } from './../repository/poll/poll-result-repository';
import {
  POLL_ANSWER_LIFE_CYCLE,
  EVENT_USER_LIFE_CYCLE,
} from '../graphql/resolver/subscription/subscription-types';
import { updateEventUserOnlineState } from '../repository/event-user-repository';
import { yoga, pubsub } from './../server/graphql';
import { createPollUserIfNeeded } from '../service/poll-service';
import { userFromAuthHeader } from './user-context';

// SEC-16: Der Nutzer wird einmal beim Verbindungsaufbau per jwt.verify bestimmt (onConnect)
// und gilt für alle Subscriptions dieser Verbindung. Ohne gültigen Token keine Verbindung.

export async function onSubscribeWebsocket(ctx, id, payload) {
  const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({
    ...ctx,
    req: ctx.extra.request,
    socket: ctx.extra.socket,
    params: payload,
  });

  let document;
  try {
    document = parse(payload.query);
  } catch (error) {
    return [new GraphQLError('Invalid query.')];
  }
  const errors = validate(schema, document);
  if (errors.length) {
    return errors;
  }
  // SEC-16: Über WebSocket nur Subscriptions – Queries/Mutationen laufen über HTTP mit Prüfung.
  const operation = getOperationAST(document, payload.operationName);
  if (operation?.operation !== 'subscription') {
    return [new GraphQLError('Only subscriptions are allowed over WebSocket.')];
  }

  const contextValue = await contextFactory();
  contextValue.user = ctx.extra.user || undefined;

  return {
    schema,
    operationName: payload.operationName,
    document,
    variableValues: payload.variables,
    contextValue,
    rootValue: { execute, subscribe },
  };
}

async function markEventUserOnline(eventUser) {
  const result = await updateEventUserOnlineState(eventUser.id, true);
  if (result?.shouldPublish === true) {
    pubsub.publish(
      EVENT_USER_LIFE_CYCLE,
      { online: true, eventUserId: eventUser.id, eventId: eventUser.eventId },
      { priority: true }
    );
  }
  if (!eventUser.allowToVote) return;
  const activePollResult = await findActivePoll(eventUser.eventId);
  if (!activePollResult) return;
  await createPollUserIfNeeded(activePollResult.id, eventUser.id);
  const leftAnswersDataSet = await findLeftAnswersCount(activePollResult.id);
  if (leftAnswersDataSet) {
    pubsub.publish(
      POLL_ANSWER_LIFE_CYCLE,
      { ...leftAnswersDataSet, eventId: eventUser.eventId },
      { filterBy: { eventId: eventUser.eventId } }
    );
  }
}

export async function onConnectWebsocket(ctx) {
  const user = await userFromAuthHeader(ctx.connectionParams?.authorization);
  if (!user) {
    // Ohne JWT-Pflicht (nur development/test, s. assertSecureConfig) anonym zulassen.
    return process.env.ENABLE_JWT !== '1';
  }
  ctx.extra.user = user;
  if (user.type === 'event-user') {
    try {
      await markEventUserOnline(user.eventUser);
    } catch (error) {
      console.warn('[WARN] WebSocket: Online-Status konnte nicht gesetzt werden:', error.message);
    }
  }
  return true;
}

export async function onDisconnectWebsocket(ctx) {
  const user = ctx.extra?.user;
  if (user?.type !== 'event-user') return;
  try {
    const result = await updateEventUserOnlineState(user.id, false);
    if (result?.shouldPublish === true) {
      pubsub.publish(
        EVENT_USER_LIFE_CYCLE,
        { online: false, eventUserId: user.id, eventId: user.eventId },
        { priority: true }
      );
    }
  } catch (error) {
    console.warn('[WARN] WebSocket: Offline-Status konnte nicht gesetzt werden:', error.message);
  }
}
