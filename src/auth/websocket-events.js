import { findOneById as findEventUserById } from "./../repository/event-user-repository";
import {
  findActivePoll,
  findLeftAnswersCount,
} from "./../repository/poll/poll-result-repository";
import { POLL_ANSWER_LIFE_CYCLE, EVENT_USER_LIFE_CYCLE } from "../graphql/resolver/subscription/subscription-types";
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

  // Create base context
  let contextValue = await contextFactory();

  // Add user context to subscription context if available
  if (ctx.connectionParams && ctx.connectionParams.authorization) {
    try {
      const authHeader = ctx.connectionParams.authorization;
      if (authHeader.startsWith('Bearer ')) {
        const jwtToken = authHeader.substring(7);

        try {
          // Use verifyJwt instead of just decoding the token
          const { verifyJwt } = require('../lib/jwt-auth');
          const verifiedToken = await verifyJwt(jwtToken);

          // Set user information in the context from verified token
          if (verifiedToken && verifiedToken.user) {
            contextValue.user = verifiedToken.user;

            // If it's an event user, load additional information
            if (verifiedToken.user.type === 'event-user' && verifiedToken.user.id) {
              const { findOneById } = require('../repository/event-user-repository');
              const eventUser = await findOneById(parseInt(verifiedToken.user.id));
              if (eventUser) {
                contextValue.user.eventUser = eventUser;
              }
            }
          }
          else if (verifiedToken && verifiedToken.eventUserId) {
            // Legacy format support with proper parsing of ID
            contextValue.user = {
              id: parseInt(verifiedToken.eventUserId, 10),
              type: 'event-user'
            };
          }
        } catch (verifyError) {
          // Fallback to decode if verification fails (for backward compatibility)
          console.warn("[WARN] JWT verification failed, falling back to decode:", verifyError);
          const decodedToken = jwt.decode(jwtToken);

          // Set user information in the context from decoded token
          if (decodedToken && decodedToken.user) {
            contextValue.user = decodedToken.user;
            if (typeof contextValue.user.id === 'string' && !isNaN(contextValue.user.id)) {
              contextValue.user.id = parseInt(contextValue.user.id, 10);
            }
          }
          else if (decodedToken && decodedToken.eventUserId) {
            // Legacy format support with proper parsing of ID
            contextValue.user = {
              id: parseInt(decodedToken.eventUserId, 10),
              type: 'event-user'
            };
          }
        }
      }
    } catch (error) {
      console.warn("[WARN] Error extracting user context for subscription:", error);
    }
  }

  const args = {
    schema,
    operationName: msg.payload.operationName,
    document: parse(msg.payload.query),
    variableValues: msg.payload.variables,
    contextValue,
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

  // OPTIMIERUNG: Prüfen, ob JWT-Authentifizierung deaktiviert ist
  if (process.env.ENABLE_JWT !== "1") {

    // Erweiterung: Versuche Benutzer-Metadaten aus den Verbindungsparametern oder Cookies zu extrahieren
    try {
      let eventUserId = null;

      // Versuche, einen WebSocket connectionParam für eventUserId zu finden
      if (ctx.connectionParams && ctx.connectionParams.eventUserId) {
        eventUserId = parseInt(ctx.connectionParams.eventUserId);
      }

      // Prüfe auf ein JWT-Token, selbst wenn JWT-Auth deaktiviert ist
      else if (ctx.connectionParams && ctx.connectionParams.authorization) {
        try {
          const authHeader = ctx.connectionParams.authorization;
          if (authHeader.startsWith('Bearer ')) {
            const jwtToken = authHeader.substring(7);
            const decodedToken = jwt.decode(jwtToken);

            if (decodedToken && decodedToken.eventUserId) {
              eventUserId = parseInt(decodedToken.eventUserId);
            }
            else if (decodedToken && decodedToken.user && decodedToken.user.type === "event-user") {
              eventUserId = parseInt(decodedToken.user.id);
            }
          }
        } catch (error) {
          console.warn("[WARN] Fehler beim Extrahieren der User-ID aus JWT-Token:", error);
        }
      }

      // Wenn wir eine eventUserId gefunden haben, aktualisiere den Online-Status
      if (eventUserId) {
        try {
          const eventUser = await findEventUserById(eventUserId);
          if (eventUser) {
            // Benutzer als online markieren
            const result = await updateEventUserOnlineState(eventUserId, true);

            // PubSub-Event senden, wenn nötig
            if (result && result.shouldPublish === true) {
              pubsub.publish(EVENT_USER_LIFE_CYCLE, {
                online: true,
                eventUserId: eventUserId,
                eventId: eventUser.eventId
              });
            }

            // Aktive Umfragen verarbeiten
            const activePollResult = await findActivePoll(eventUser.eventId);
            if (activePollResult && eventUser.allowToVote) {
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
        } catch (error) {
          console.warn(`[WARN] Fehler beim Aktualisieren des Online-Status für User ${eventUserId} mit deaktiviertem JWT:`, error);
        }
      }
    } catch (error) {
      console.error("[ERROR] Fehler beim Verarbeiten der WebSocket-Verbindung mit deaktiviertem JWT:", error);
    }

    // Bei deaktivierter JWT-Authentifizierung trotzdem weitermachen
    return;
  }

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

        try {
          // JWT-Token dekodieren (ohne Überprüfung)
          const decodedToken = jwt.decode(jwtToken);


          if (decodedToken && (decodedToken.eventUserId || decodedToken.userId || decodedToken.organizerId ||
            (decodedToken.user && decodedToken.user.id))) {

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
                  const result = await updateEventUserOnlineState(parseInt(eventUserId), true);

                  // Prüfen, ob wir ein PubSub-Event senden sollen
                  if (result && result.shouldPublish === true) {
                    pubsub.publish(EVENT_USER_LIFE_CYCLE, {
                      online: true,
                      eventUserId: parseInt(eventUserId),
                      eventId: eventUser.eventId
                    });
                  }
                }
              } catch (userLookupError) {
                console.warn("[WARN] JWT-Auth: Event-User nicht gefunden:", userLookupError);
              }
            } else if (decodedToken.organizerId) {
              isAuthorized = true;
            } else if (decodedToken.user && decodedToken.user.id) {
              // Wir haben eine Benutzer-ID im Token, aber nicht als dediziertes Feld
              // Prüfen, ob es sich um einen Event-User handelt
              if (decodedToken.user.type === "event-user" && decodedToken.role === "event-user") {
                token = null; // Kein refreshToken erforderlich
                eventUserId = decodedToken.user.id;
                isAuthorized = true;
                // Benutzer als online markieren
                try {
                  const eventUser = await findEventUserById(parseInt(eventUserId));
                  if (eventUser) {
                    const result = await updateEventUserOnlineState(parseInt(eventUserId), true);

                    // Prüfen, ob wir ein PubSub-Event senden sollen
                    if (result && result.shouldPublish === true) {
                      pubsub.publish(EVENT_USER_LIFE_CYCLE, {
                        online: true,
                        eventUserId: parseInt(eventUserId),
                        eventId: eventUser.eventId
                      });
                    }
                  }
                } catch (userLookupError) {
                  console.warn("[WARN] JWT-Auth: Event-User nicht gefunden:", userLookupError);
                }
              } else if (decodedToken.user.type === "organizer" && decodedToken.role === "organizer") {
                isAuthorized = true;
              }
            }
          } else {
            console.warn("[WARN] JWT-Token enthält keine User-ID");
            console.warn("[DEBUG] Token Payload:", JSON.stringify(decodedToken));
          }
        } catch (jwtError) {
          console.warn("[WARN] JWT-Token konnte nicht dekodiert werden:", jwtError);
          console.error(jwtError);
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

  // Wenn kein Token verwendet wird (JWT-Auth für Event-User oder Organizer), dann sind wir hier fertig
  if (!token) {
    return;
  }

  // RefreshToken wurde gefunden, User als online markieren
  try {
    await toggleUserOnlineStateByRequestToken(token, true);
    const tokenRecord = await findOneByRefreshToken(token);

    if (!tokenRecord) {
      console.warn("[WARN] Token im System nicht gefunden");
      return;
    }

    // eventUserId aus dem TokenRecord extrahieren
    eventUserId = tokenRecord.eventUserId;

    // Prüfen, ob eine eventUserId gefunden wurde
    if (!tokenRecord.eventUserId) {
      console.warn("[WARN] Keine User-ID im Token gefunden, kann Online-Status nicht aktualisieren");
      return;
    }

    // Event user has connected to the server.
    // Fetch and validate event user.
    const eventUser = await findEventUserById(
      parseInt(tokenRecord.eventUserId),
    );

    if (!eventUser) {
      console.error(`Event user with id ${tokenRecord.eventUserId} not found.`);
      return;
    }

    // Tell subscribers about the successfull connection.
    pubsub.publish(EVENT_USER_LIFE_CYCLE, {
      online: true,
      eventUserId: eventUser.id,
      eventId: eventUser.eventId
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
  } catch (error) {
    console.error("[ERROR] Fehler beim Verarbeiten des Refresh-Tokens:", error);
    return;
  }
}

export async function onDisconnectWebsocket(ctx) {

  // OPTIMIERUNG: Prüfen, ob JWT-Authentifizierung deaktiviert ist
  if (process.env.ENABLE_JWT !== "1") {

    // Erweiterung: Versuche Benutzer-Metadaten aus den Verbindungsparametern oder Cookies zu extrahieren
    try {
      let eventUserId = null;

      // Versuche, einen WebSocket connectionParam für eventUserId zu finden
      if (ctx.connectionParams && ctx.connectionParams.eventUserId) {
        eventUserId = parseInt(ctx.connectionParams.eventUserId);
        console.info(`[INFO] WebSocket Disconnect mit eventUserId: ${eventUserId}`);
      }

      // Prüfe auf ein JWT-Token, selbst wenn JWT-Auth deaktiviert ist
      else if (ctx.connectionParams && ctx.connectionParams.authorization) {
        try {
          const authHeader = ctx.connectionParams.authorization;
          if (authHeader.startsWith('Bearer ')) {
            const jwtToken = authHeader.substring(7);
            const decodedToken = jwt.decode(jwtToken);

            if (decodedToken && decodedToken.eventUserId) {
              eventUserId = parseInt(decodedToken.eventUserId);
            }
            else if (decodedToken && decodedToken.user && decodedToken.user.type === "event-user") {
              eventUserId = parseInt(decodedToken.user.id);
                    }
          }
        } catch (error) {
          console.warn("[WARN] Fehler beim Extrahieren der User-ID aus JWT-Token beim Disconnect:", error);
        }
      }

      // Wenn wir eine eventUserId gefunden haben, aktualisiere den Online-Status
      if (eventUserId) {
        try {
          // Erst den EventUser abrufen, um die eventId zu bekommen
          const eventUserLookup = await findEventUserById(parseInt(eventUserId));
          if (!eventUserLookup) {
            return;
          }

          // Benutzer als offline markieren
          const result = await updateEventUserOnlineState(eventUserId, false);

          // PubSub-Event senden, wenn nötig
          if (result && result.shouldPublish === true) {
            pubsub.publish(EVENT_USER_LIFE_CYCLE, {
              online: false,
              eventUserId: eventUserId,
              eventId: eventUserLookup.eventId
            });
          }
        } catch (error) {
          console.warn(`[WARN] Fehler beim Aktualisieren des Offline-Status für User ${eventUserId} mit deaktiviertem JWT:`, error);
        }
      }
    } catch (error) {
      console.error("[ERROR] Fehler beim Verarbeiten des WebSocket-Disconnects mit deaktiviertem JWT:", error);
    }

    // Bei deaktivierter JWT-Authentifizierung beenden
    return;
  }

  // Variable für den Token initialisieren
  let token = null;
  let isAuthorized = false;

  // METHODE 1: JWT Auth-Token aus dem Authorization-Header extrahieren (empfohlen)
  if (ctx.connectionParams && ctx.connectionParams.authorization) {
    try {
      const authHeader = ctx.connectionParams.authorization;
      if (authHeader.startsWith('Bearer ')) {
        const jwtToken = authHeader.substring(7);

        try {
          // JWT-Token dekodieren (ohne Überprüfung)
          const decodedToken = jwt.decode(jwtToken);

          if (decodedToken && decodedToken.eventUserId) {
            const eventUserId = decodedToken.eventUserId;

            // Event-User abrufen, um eventId zu holen
            const eventUserLookup = await findEventUserById(parseInt(eventUserId));
            if (!eventUserLookup) {
              console.warn(`[WARN] Benutzer mit ID ${eventUserId} nicht gefunden beim JWT Disconnect`);
              return;
            }

            // Direkt via Event-User-ID als offline markieren
            const result = await updateEventUserOnlineState(parseInt(eventUserId), false);

            // Event User Lifecycle Event nur auslösen, wenn sich der Status geändert hat
            if (result && result.shouldPublish === true) {
              pubsub.publish(EVENT_USER_LIFE_CYCLE, {
                online: false,
                eventUserId: parseInt(eventUserId),
                eventId: eventUserLookup.eventId
              });
            }

            // Wir haben den Offline-Status bereits aktualisiert, also hier fertig
            return;
          } else if (decodedToken && decodedToken.organizerId) {
            // Wir markieren den Trennung als erfolgreich behandelt
            return;
          } else if (decodedToken && decodedToken.user && decodedToken.user.id) {
            // Benutzer-ID aus dem user-Feld extrahieren
            if (decodedToken.user.type === "event-user" && decodedToken.role === "event-user") {
              const eventUserId = decodedToken.user.id;

              // Event-User abrufen, um eventId zu holen
              const eventUserLookup = await findEventUserById(parseInt(eventUserId));
              if (!eventUserLookup) {
                console.warn(`[WARN] Benutzer mit ID ${eventUserId} nicht gefunden beim JWT user.id Disconnect`);
                return;
              }

              // Direkt via Event-User-ID als offline markieren
              const result = await updateEventUserOnlineState(parseInt(eventUserId), false);

              // Event User Lifecycle Event nur auslösen, wenn sich der Status geändert hat
              if (result && result.shouldPublish === true) {
                  pubsub.publish(EVENT_USER_LIFE_CYCLE, {
                  online: false,
                  eventUserId: parseInt(eventUserId),
                  eventId: eventUserLookup.eventId
                });
              }

              // Wir haben den Offline-Status bereits aktualisiert, also hier fertig
              return;
            } else if (decodedToken.user.type === "organizer" && decodedToken.role === "organizer") {
              return;
            }
          }
          console.warn("[WARN] JWT-Token enthält keine bekannte User-ID für Disconnect");
        } catch (jwtError) {
          console.warn("[WARN] JWT-Token konnte beim Disconnect nicht dekodiert werden:", jwtError);
          console.error(jwtError);
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

  // JWT Auth wurde bereits verarbeitet (für User und Organizer) - wir müssen nichts weiter tun
  if (!token) {
        return;
  }

  // RefreshToken wurde gefunden, User als offline markieren
  try {
    await toggleUserOnlineStateByRequestToken(token, false);
    const tokenRecord = await findOneByRefreshToken(token);

    if (!tokenRecord) {
      console.warn("[WARN] Token für Disconnect nicht gefunden");
      return;
    }

    if (tokenRecord.eventUserId) {
      // Need to fetch the event ID for this user first
      const tokenEventUser = await findEventUserById(parseInt(tokenRecord.eventUserId));
      pubsub.publish(EVENT_USER_LIFE_CYCLE, {
        online: false,
        eventUserId: tokenRecord.eventUserId,
        eventId: tokenEventUser ? tokenEventUser.eventId : null
      });
    }
  } catch (error) {
    console.error("[ERROR] Fehler beim Verarbeiten des Refresh-Tokens für Disconnect:", error);
    return;
  }
}
