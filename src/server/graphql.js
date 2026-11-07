import { makeExecutableSchema } from '@graphql-tools/schema';
import typeDefs from '../../res/schema.graphql';
import resolvers from '../graphql/resolvers';
import { createYoga, useExtendContext, createPubSub } from 'graphql-yoga';
import ThrottledPubSub from '../lib/pubsub-throttle';
import { GraphQLError, Kind, NoSchemaIntrospectionCustomRule } from 'graphql';
import { userFromAuthHeader } from '../auth/user-context';
import { isDevEnv } from './security';

const isDev = isDevEnv();

// SEC-32: Fehler, die ein Resolver bewusst wirft (z. B. 'Not authorized.'), bleiben lesbar;
// Datenbank- und Laufzeitfehler werden zu einer generischen Meldung.
const RUNTIME_ERRORS = ['TypeError', 'ReferenceError', 'RangeError', 'SyntaxError'];
function maskError(error, message) {
  const original = error?.originalError;
  if (!original) return error; // Parse-/Validierungsfehler
  const internal =
    original.code ||
    original.errno ||
    original.sqlMessage ||
    RUNTIME_ERRORS.includes(original.name);
  return internal ? new GraphQLError(message) : error;
}

// Create the base PubSub instance
const basePubSub = createPubSub();

// Create a throttled wrapper around it
export const pubsub = new ThrottledPubSub(basePubSub);

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  resolverValidationOptions: {},
  parseOptions: {},
  inheritResolversFromInterfaces: false,
});

// SEC-34: Tiefe begrenzen (Client-Queries brauchen < 8). Introspection-Felder (__*) zählen nicht.
const MAX_QUERY_DEPTH = 10;
function depthLimitRule(context) {
  const fragments = {};
  const depthOf = (selectionSet, depth, seen) => {
    if (!selectionSet) return depth;
    let max = depth;
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        if (selection.name.value.startsWith('__')) continue;
        max = Math.max(max, depthOf(selection.selectionSet, depth + 1, seen));
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        max = Math.max(max, depthOf(selection.selectionSet, depth, seen));
      } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
        const name = selection.name.value;
        if (seen.has(name) || !fragments[name]) continue;
        max = Math.max(max, depthOf(fragments[name].selectionSet, depth, new Set([...seen, name])));
      }
    }
    return max;
  };
  return {
    Document(node) {
      node.definitions
        .filter((definition) => definition.kind === Kind.FRAGMENT_DEFINITION)
        .forEach((definition) => (fragments[definition.name.value] = definition));
      node.definitions
        .filter((definition) => definition.kind === Kind.OPERATION_DEFINITION)
        .forEach((definition) => {
          if (depthOf(definition.selectionSet, 0, new Set()) > MAX_QUERY_DEPTH) {
            context.reportError(
              new GraphQLError(`Query is too deep (max. ${MAX_QUERY_DEPTH}).`, {
                nodes: [definition],
              })
            );
          }
        });
    },
  };
}

const useSecurityValidation = () => ({
  onValidate({ addValidationRule }) {
    addValidationRule(depthLimitRule);
    // SEC-33: keine Introspection außerhalb development/test.
    if (!isDev) addValidationRule(NoSchemaIntrospectionCustomRule);
  },
});

export const yoga = createYoga({
  schema,
  port: process.env.APP_PORT,
  hostname: process.env.APP_DOMAIN,
  logging: isDev ? 'debug' : false,
  // SEC-32: interne Fehler (SQL o. ä.) nur in development/test im Klartext. Fehler, die ein
  // Resolver bewusst wirft (Error mit Meldung), maskiert yoga nicht – nur unerwartete.
  maskedErrors: isDev ? false : { maskError },
  context: async ({ request, req }) => {
    // Refresh-Cookie der aktuellen Sitzung (Express/cookie-parser), z. B. um sie beim Passwortwechsel zu behalten.
    const baseContext = { pubsub, refreshToken: req?.signedCookies?.refreshToken || null };
    // HTTP: Headers-Objekt mit get(); WebSocket-Kontext setzt den Nutzer in onSubscribe selbst.
    const authHeader =
      request?.headers && typeof request.headers.get === 'function'
        ? request.headers.get('authorization')
        : null;
    const user = await userFromAuthHeader(authHeader);
    if (user) baseContext.user = user;
    return baseContext;
  },
  plugins: [useExtendContext(() => ({ pubsub })), useSecurityValidation()],
  graphqlEndpoint: process.env.GRAPHQL_ENDPOINT,
  // SEC-33: GraphiQL nur in development/test.
  graphiql: isDev ? { subscriptionsProtocol: 'WS' } : false,
});
