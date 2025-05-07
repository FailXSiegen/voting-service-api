import * as jwt from "jsonwebtoken";

export default async function (req, res, next) {
  // If JWT is disabled, skip authentication
  if (process.env.ENABLE_JWT !== "1") {
    return next();
  }

  // Only apply to GraphQL endpoint
  if (req.url !== process.env.GRAPHQL_ENDPOINT) {
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

      // Check if it's a systemSettings query - these should be allowed without auth
      if (body.query && (
        body.query.includes('systemSettings') ||
        body.query.includes('GetSystemSettings') ||
        body.operationName === 'GetSystemSettings'
      )) {
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

    const token = authHeader.split(" ")[1] || "";
    await jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    console.warn('Authentication failed:', e.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}
