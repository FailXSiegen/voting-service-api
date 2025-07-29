import { makeExecutableSchema } from "@graphql-tools/schema";
import typeDefs from "../../res/schema.graphql";
import resolvers from "../graphql/resolvers";
import { createYoga, useExtendContext, createPubSub } from "graphql-yoga";
import ThrottledPubSub from "../lib/pubsub-throttle";

const isDev = process.env.NODE_ENV === 'development';

// Create the base PubSub instance
const basePubSub = createPubSub();

// Create a throttled wrapper around it
export const pubsub = new ThrottledPubSub(basePubSub);

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  resolverValidationOptions: {},
  parseOptions: {},
  inheritResolversFromInterfaces: false,
});

export const context = { pubsub };

export const yoga = createYoga({
  schema,
  port: process.env.APP_PORT,
  hostname: process.env.APP_DOMAIN,
  logging: isDev ? {
    debug: (...args) => console.log('[DEBUG] GraphQL Yoga:', ...args),
    info: (...args) => console.log('[INFO] GraphQL Yoga:', ...args),
    warn: (...args) => console.warn('[WARN] GraphQL Yoga:', ...args),
    error: (...args) => console.error('[ERROR] GraphQL Yoga:', ...args),
  } : false,
  maskedErrors: false,
  // Hier definieren wir eine Funktion, die für jede Anfrage den Kontext erstellt
  context: async ({ request }) => {
    if (isDev) {
      console.log('[DEBUG] graphql.js - Creating context for request');
    }
    
    // Basis-Kontext
    const baseContext = { pubsub };

    try {
      // Extrahiere den JWT-Token aus dem Authorization-Header, wenn vorhanden
      let token = null;
      
      // Verbesserte Prüfung für WebSocket und HTTP-Anfragen
      if (request && request.headers && typeof request.headers.get === 'function') {
        // HTTP-Anfragen haben ein headers-Objekt mit get-Methode
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
          if (isDev) {
            console.log('[DEBUG] graphql.js - Found token in HTTP headers');
          }
        }
      } else if (request && request.headers && typeof request.headers === 'object') {
        // Fallback für WebSocket-Anfragen, die eventuell ein anderes headers-Format haben
        const authHeader = request.headers.authorization || 
                          (request.headers.Authorization) || 
                          '';
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
          if (isDev) {
            console.log('[DEBUG] graphql.js - Found token in WebSocket headers');
          }
        }
      } else if (request && request.connectionParams) {
        // Direkte Unterstützung für WebSocket connectionParams
        const authHeader = request.connectionParams.authorization || '';
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
          if (isDev) {
            console.log('[DEBUG] graphql.js - Found token in WebSocket connectionParams');
          }
        }
      }
      
      // Wenn wir einen Token haben, verifizieren und dekodieren
      if (token) {
        const { verifyJwt } = require('../lib/jwt-auth');

        try {
          // JWT-Token verifizieren und dekodieren
          const decodedToken = await verifyJwt(token);

          if (decodedToken && decodedToken.user) {
            // Benutzertyp-spezifische Informationen laden
            let user = { ...decodedToken.user };

            // Falls es ein Organizer ist, lade zusätzliche Informationen
            if (user.type === 'organizer' && user.id) {
              const { findOneById } = require('../repository/organizer-repository');
              const organizer = await findOneById(user.id);
              if (organizer) {
                user.organizer = organizer;
              }
            }

            // Falls es ein Event-User ist, lade zusätzliche Informationen
            if (user.type === 'event-user' && user.id) {
              const { findOneById } = require('../repository/event-user-repository');
              const eventUser = await findOneById(user.id);
              if (eventUser) {
                user.eventUser = eventUser;
              }
            }

            // Füge den Benutzer zum Kontext hinzu
            baseContext.user = user;
            if (isDev) {
              console.log('[DEBUG] graphql.js - User context created:', {
                type: user.type,
                id: user.id,
                eventId: user.eventUser?.eventId || user.organizer?.id
              });
            }
          }
        } catch (err) {
          if (isDev) {
            console.error('[ERROR] graphql.js - Fehler beim Dekodieren des JWT-Tokens im GraphQL-Kontext:', err.message);
          }
        }
      }
    } catch (error) {
      if (isDev) {
        console.error('[ERROR] graphql.js - Fehler beim Erstellen des GraphQL-Kontexts:', error.message);
      }
    }

    return baseContext;
  },
  plugins: [useExtendContext(() => ({ pubsub }))],
  graphqlEndpoint: process.env.GRAPHQL_ENDPOINT,
  graphiql: {
    subscriptionsProtocol: "WS",
  },
});
