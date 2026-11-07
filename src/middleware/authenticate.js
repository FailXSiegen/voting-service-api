import { parse } from 'graphql';
import { userFromAuthHeader } from '../auth/user-context';
import { verifyJwt } from '../lib/jwt-auth';
import { updateLastActivity } from '../repository/event-user-repository';
import { findOneByRefreshToken } from '../repository/jwt-refresh-token-repository';

const PUBLIC_QUERY_FIELDS = [
  '__typename',
  'systemSettings',
  'staticContentsByPage',
  'staticContentBySection',
  'staticContentByPageSlug',
  'pageSlugs',
  'pageSlugByPageKey',
  'pageSlugBySlug',
  'translations',
  'translationsByLocale',
];

// REST-Routen ohne Login. Alles andere außer GraphQL braucht einen gültigen JWT.
// GET /event/:id und verify-slug liefern ohne Login nur öffentliche Felder (SEC-17).
const PUBLIC_REST = [
  /^\/login(\/[a-z-]+)?$/,
  /^\/logout$/,
  /^\/event\/verify-slug$/,
  /^\/event\/\d+$/,
  /^\/organizer\/(validate-hash|password-forgot|update-password|create)$/,
  /^\/uploads\//,
  /^\/api\/shortlink\/[^/]+$/,
  /^\/s\/[^/]+$/,
];

// Only a query selecting nothing but public root fields runs without a token.
function isPublicQuery(source) {
  try {
    return parse(source).definitions.every(
      (definition) =>
        definition.kind === 'OperationDefinition' &&
        definition.operation === 'query' &&
        definition.selectionSet.selections.every(
          (selection) =>
            selection.kind === 'Field' && PUBLIC_QUERY_FIELDS.includes(selection.name.value)
        )
    );
  } catch (error) {
    return false;
  }
}

export default async function (req, res, next) {
  // If JWT is disabled, skip authentication
  if (process.env.ENABLE_JWT !== '1') {
    return next();
  }

  // Allow OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    return next();
  }

  // SEC-17: REST ist deny-by-default, nur diese Routen laufen ohne Token.
  if (PUBLIC_REST.some((pattern) => pattern.test(req.path))) {
    return next();
  }

  if (req.path !== process.env.GRAPHQL_ENDPOINT) {
    // Verifizierter JWT + Nutzer aus der DB (eventId des Teilnehmers nie aus dem Token).
    req.user = await userFromAuthHeader(req.headers.authorization);
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication failed' });
    }
    return next();
  }

  // For POST requests, check if it's a query that should bypass auth
  if (req.method === 'POST' && req.body) {
    try {
      // Try to parse the request body
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      // Check if it's the KeepAlive query - update last_activity if token exists
      if (body.operationName === 'KeepAlive' && req.cookies && req.cookies.refreshToken) {
        const token = req.cookies.refreshToken;
        try {
          const tokenRecord = await findOneByRefreshToken(token);
          if (tokenRecord && tokenRecord.eventUserId) {
            await updateLastActivity(tokenRecord.eventUserId);
          }
        } catch (e) {
          // Just log the error, don't block the request
          console.warn('Error updating activity timestamp:', e.message);
        }
      }

      if (typeof body.query === 'string' && isPublicQuery(body.query)) {
        return next();
      }
    } catch (parseError) {
      console.error('Error parsing request body in auth middleware:', parseError);
      // If we can't parse it, continue with normal auth check
    }
  }

  // Regular auth check for other requests. Den Nutzer lädt der GraphQL-Kontext (graphql.js).
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'No authorization header' });
  }
  try {
    await verifyJwt(req.headers.authorization.split(' ')[1] || '');
  } catch (e) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
  return next();
}
