import { makeExecutableSchema } from "@graphql-tools/schema";
import typeDefs from "../../res/schema.graphql";
import resolvers from "../graphql/resolvers";
import { createYoga, useExtendContext, createPubSub } from "graphql-yoga";
import ThrottledPubSub from "../lib/pubsub-throttle";

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
  logging: true,
  maskedErrors: false,
  // Hier definieren wir eine Funktion, die für jede Anfrage den Kontext erstellt
  context: async ({ request }) => {
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
        }
      } else if (request && request.headers && typeof request.headers === 'object') {
        // Fallback für WebSocket-Anfragen, die eventuell ein anderes headers-Format haben
        const authHeader = request.headers.authorization || 
                          (request.headers.Authorization) || 
                          '';
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
        }
      } else if (request && request.connectionParams) {
        // Direkte Unterstützung für WebSocket connectionParams
        const authHeader = request.connectionParams.authorization || '';
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
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
          }
        } catch (err) {
          console.error('Fehler beim Dekodieren des JWT-Tokens im GraphQL-Kontext:', err);
        }
      }
    } catch (error) {
      console.error('Fehler beim Erstellen des GraphQL-Kontexts:', error);
    }

    return baseContext;
  },
  plugins: [useExtendContext(() => ({ pubsub }))],
  graphqlEndpoint: process.env.GRAPHQL_ENDPOINT,
  graphiql: {
    subscriptionsProtocol: "WS",
  },
});
