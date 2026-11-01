import * as jwt from 'jsonwebtoken';
import { parse } from 'graphql';
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

// Only a query selecting nothing but public root fields runs without a token.
export function isPublicQuery(source) {
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

  // Skip authentication for public endpoints
  const publicEndpoints = [
    '/login',
    '/login/refresh',
    '/login/activate-event-user-auth-token',
    '/login/event-user-auth-token',
    '/organizer/validate-hash',
    '/organizer/password-forgot',
    '/organizer/create',
    '/event/verify-slug',
  ];

  if (publicEndpoints.includes(req.path) || req.path !== process.env.GRAPHQL_ENDPOINT) {
    return next();
  }

  // Allow OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
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

  // Regular auth check for other requests
  try {
    const authHeader = req.headers.authorization;

    // If no auth header is present, reject
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1] || '';
    await jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    console.warn('Authentication failed:', e.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}
