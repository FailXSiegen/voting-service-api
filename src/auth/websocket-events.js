import { findOneById as findEventUserById } from "./../repository/event-user-repository";
import {
  findActivePoll,
  findLeftAnswersCount,
} from "./../repository/poll/poll-result-repository";
import { POLL_ANSWER_LIFE_CYCLE } from "../graphql/resolver/subscription/subscription-types";
import { extractCookieValueByHeader } from "../lib/cookie-from-string-util";
import { toggleUserOnlineStateByRequestToken } from "../repository/event-user-repository";
import { yoga, pubsub } from "./../server/graphql";
import { findOneByRefreshToken } from "../repository/jwt-refresh-token-repository";
import { createPollUserIfNeeded } from "../service/poll-service";

export async function onSubscribeWebsocket(ctx, msg) {
  const { schema, execute, subscribe, contextFactory, parse, validate } =
    yoga.getEnveloped({
      ...ctx,
      req: ctx.extra.request,
      socket: ctx.extra.socket,
      params: msg.payload,
    });

  const args = {
    schema,
    operationName: msg.payload.operationName,
    document: parse(msg.payload.query),
    variableValues: msg.payload.variables,
    contextValue: await contextFactory(),
    rootValue: {
      execute,
      subscribe,
    },
  };

  const errors = validate(args.schema, args.document);
  if (errors.length) {
    return errors;
  }

  return args;
}

export async function onConnectWebsocket(ctx) {
  console.info("[INFO] User connected");
  // Sicherheitsprüfung: Überprüfe, ob request und headers existieren
  if (!ctx.extra || !ctx.extra.request || !ctx.extra.request.headers || !ctx.extra.request.headers.cookie) {
    console.warn("[WARN] WebSocket Connect ohne gültige Headers");
    return;
  }

  // Extract the token from the received cookies.
  const token = extractCookieValueByHeader(
    ctx.extra.request.headers.cookie,
    "refreshToken",
  );
  if (token === null) {
    return;
  }

  // Extract the token from the received cookies.
  await toggleUserOnlineStateByRequestToken(token, true);
  const tokenRecord = await findOneByRefreshToken(token);
  if (!tokenRecord) {
    return;
  }

  // Event user has connected to the server.
  if (tokenRecord.eventUserId) {
    // Fetch and validte event user.
    const eventUser = await findEventUserById(
      parseInt(tokenRecord.eventUserId),
    );
    if (!eventUser) {
      console.error(`Event user with id ${tokenRecord.eventUserId} not found.`);
      return;
    }

    // Tell subscribers about the successfull connection.
    pubsub.publish("eventUserLifeCycle", {
      online: true,
      eventUserId: eventUser.id,
    });

    // Handle active poll updates related to this event user.
    if (eventUser?.allowToVote) {
      const activePollResult = await findActivePoll(eventUser.eventId);
      if (!activePollResult) {
        return;
      }

      await createPollUserIfNeeded(activePollResult.id, eventUser.id);

      const leftAnswersDataSet = await findLeftAnswersCount(
        activePollResult.id,
      );
      if (leftAnswersDataSet) {
        pubsub.publish(POLL_ANSWER_LIFE_CYCLE, {
          ...leftAnswersDataSet,
          eventId: eventUser.eventId,
        });
      }
    }
  }
}

export async function onDisconnectWebsocket(ctx) {
  console.info("[INFO] User disconnected!");
  // Sicherheitsprüfung: Überprüfe, ob request und headers existieren
  if (!ctx.extra || !ctx.extra.request || !ctx.extra.request.headers || !ctx.extra.request.headers.cookie) {
    console.warn("[WARN] WebSocket Disconnect ohne gültige Headers");
    return;
  }

  const token = extractCookieValueByHeader(
    ctx.extra.request.headers.cookie,
    "refreshToken",
  );
  if (token === null) {
    return;
  }

  // Extract the token from the received cookies.
  await toggleUserOnlineStateByRequestToken(token, true);
  const tokenRecord = await findOneByRefreshToken(token);
  if (!tokenRecord) {
    return;
  }

  if (tokenRecord.eventUserId) {
    pubsub.publish("eventUserLifeCycle", {
      online: false,
      eventUserId: tokenRecord.eventUserId,
    });
  }
}
