import { makeExecutableSchema } from "@graphql-tools/schema";
import typeDefs from "../../res/schema.graphql";
import resolvers from "../graphql/resolvers";
import { createYoga, useExtendContext, createPubSub } from "graphql-yoga";

export const pubsub = createPubSub();

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
      // Extrahiere den JWT-Token aus dem Authorization-Header
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
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
