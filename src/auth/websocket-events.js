import { findOneById as findEventUserById } from "./../repository/event-user-repository";
import {
  findActivePoll,
  findLeftAnswersCount,
} from "./../repository/poll/poll-result-repository";
import { POLL_ANSWER_LIFE_CYCLE } from "../graphql/resolver/subscription/subscription-types";
import { extractCookieValueByHeader } from "../lib/cookie-from-string-util";
import { toggleUserOnlineStateByRequestToken, updateEventUserOnlineState } from "../repository/event-user-repository";
import { yoga, pubsub } from "./../server/graphql";
import { findOneByRefreshToken } from "../repository/jwt-refresh-token-repository";
import { createPollUserIfNeeded } from "../service/poll-service";
import * as jwt from "jsonwebtoken";

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

  // Variable für den Token und eventUserId initialisieren
  let token = null;
  let eventUserId = null;
  let isAuthorized = false;

  // METHODE 1: JWT Auth-Token aus dem Authorization-Header extrahieren (empfohlen)
  if (ctx.connectionParams && ctx.connectionParams.authorization) {
    try {
      const authHeader = ctx.connectionParams.authorization;
      if (authHeader.startsWith('Bearer ')) {
        const jwtToken = authHeader.substring(7);
        console.info("[INFO] WebSocket mit JWT Bearer-Token Authentifizierung");

        try {
          // JWT-Token dekodieren (ohne Überprüfung)
          const decodedToken = jwt.decode(jwtToken);

          if (decodedToken && (decodedToken.eventUserId || decodedToken.userId)) {
            // Falls der JWT das eventUserId-Feld enthält (für Teilnehmer)
            if (decodedToken.eventUserId) {
              token = null; // Kein refreshToken erforderlich
              eventUserId = decodedToken.eventUserId;
              isAuthorized = true;

              // Wir markieren den Benutzer manuell als online, da wir keinen refreshToken haben
              try {
                const eventUser = await findEventUserById(parseInt(eventUserId));
                if (eventUser) {
                  // Hier direkt via Event-User-ID als online markieren (ohne refreshToken)
                  // Die neue updateEventUserOnlineState-Funktion verwenden
                  await updateEventUserOnlineState(parseInt(eventUserId), true);
                }
              } catch (userLookupError) {
                console.warn("[WARN] JWT-Auth: Event-User nicht gefunden:", userLookupError);
              }
            }
          } else {
            console.warn("[WARN] JWT-Token enthält keine User-ID");
          }
        } catch (jwtError) {
          console.warn("[WARN] JWT-Token konnte nicht dekodiert werden:", jwtError);
        }
      }
    } catch (authError) {
      console.warn("[WARN] WebSocket JWT Auth fehlgeschlagen:", authError);
    }
  }

  // METHODE 2: Fallback zu RefreshToken aus Cookies
  if (!isAuthorized && ctx.extra && ctx.extra.request && ctx.extra.request.headers && ctx.extra.request.headers.cookie) {
    token = extractCookieValueByHeader(
      ctx.extra.request.headers.cookie,
      "refreshToken",
    );

    if (token) {
      isAuthorized = true;
    }
  }

  // METHODE 3: Token aus connectionParams extrahieren (Fallback für Browser-Kompatibilität)
  if (!isAuthorized && ctx.connectionParams && ctx.connectionParams.refreshToken) {
    token = ctx.connectionParams.refreshToken;
    isAuthorized = true;
  }

  // Wenn keine Authentifizierung erfolgreich war
  if (!isAuthorized) {
    console.warn("[WARN] WebSocket Connect ohne gültige Authentifizierung");
    return;
  }

  // RefreshToken wurde gefunden, User als online markieren
  if (token) {
    await toggleUserOnlineStateByRequestToken(token, true);
    const tokenRecord = await findOneByRefreshToken(token);
    if (!tokenRecord) {
      console.warn("[WARN] Token im System nicht gefunden");
      return;
    }

    // eventUserId aus dem TokenRecord extrahieren
    eventUserId = tokenRecord.eventUserId;

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
  } else {
    console.warn("[WARN] Keine User-ID gefunden, kann Online-Status nicht aktualisieren");
    return;
  }
}

export async function onDisconnectWebsocket(ctx) {
  console.info("[INFO] User disconnected!");

  // Variable für den Token initialisieren
  let token = null;
  let isAuthorized = false;

  // METHODE 1: JWT Auth-Token aus dem Authorization-Header extrahieren (empfohlen)
  if (ctx.connectionParams && ctx.connectionParams.authorization) {
    try {
      const authHeader = ctx.connectionParams.authorization;
      if (authHeader.startsWith('Bearer ')) {
        const jwtToken = authHeader.substring(7);
        console.info("[INFO] WebSocket Disconnect mit JWT Token");

        try {
          // JWT-Token dekodieren (ohne Überprüfung)
          const decodedToken = jwt.decode(jwtToken);

          if (decodedToken && decodedToken.eventUserId) {
            const eventUserId = decodedToken.eventUserId;

            // Direkt via Event-User-ID als offline markieren
            await updateEventUserOnlineState(parseInt(eventUserId), false);

            // Event User Lifecycle Event auslösen
            pubsub.publish("eventUserLifeCycle", {
              online: false,
              eventUserId: parseInt(eventUserId)
            });

            // Wir haben den Offline-Status bereits aktualisiert, also hier fertig
            return;
          }
        } catch (jwtError) {
          console.warn("[WARN] JWT-Token konnte beim Disconnect nicht dekodiert werden:", jwtError);
        }

        isAuthorized = true;
      }
    } catch (authError) {
      console.warn("[WARN] WebSocket Disconnect JWT Auth fehlgeschlagen:", authError);
    }
  }

  // METHODE 2: Token aus Cookies extrahieren (Standard-Methode)
  if (!isAuthorized && ctx.extra && ctx.extra.request && ctx.extra.request.headers && ctx.extra.request.headers.cookie) {
    token = extractCookieValueByHeader(
      ctx.extra.request.headers.cookie,
      "refreshToken",
    );

    if (token) {
      isAuthorized = true;
    }
  }

  // METHODE 3: Token aus connectionParams extrahieren (Fallback für Browser-Kompatibilität)
  if (!isAuthorized && ctx.connectionParams && ctx.connectionParams.refreshToken) {
    token = ctx.connectionParams.refreshToken;
    isAuthorized = true;
  }

  // Wenn keine Authentifizierung erfolgreich war
  if (!isAuthorized) {
    console.warn("[WARN] WebSocket Disconnect ohne gültige Authentifizierung");
    return;
  }

  // RefreshToken wurde gefunden, User als offline markieren
  if (token) {
    await toggleUserOnlineStateByRequestToken(token, false);
    const tokenRecord = await findOneByRefreshToken(token);
    if (!tokenRecord) {
      console.warn("[WARN] Token für Disconnect nicht gefunden");
      return;
    }

    if (tokenRecord.eventUserId) {
      pubsub.publish("eventUserLifeCycle", {
        online: false,
        eventUserId: tokenRecord.eventUserId,
      });
    }
  } else {
    console.warn("[WARN] Kein Token für Disconnect gefunden");
    return;
  }
}
