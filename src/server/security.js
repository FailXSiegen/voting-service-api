// Zentrale Sicherheitskonfiguration. Alles außer development/test gilt als Produktion
// (auch NODE_ENV=staging oder ein fehlendes NODE_ENV): sichere Defaults.

export const isDevEnv = () => ['development', 'test'].includes(process.env.NODE_ENV);

const WEAK_SECRETS = ['my-secret', 'secret', 'changeme', 'staging-secret-key'];

function secretProblem(name) {
  const value = process.env[name] || '';
  if (Buffer.byteLength(value) < 32) return `${name} ist kürzer als 32 Byte`;
  if (WEAK_SECRETS.includes(value)) return `${name} ist ein Default-Secret`;
  return null;
}

// SEC-36/37: Fail-closed beim Start statt still offener API.
export function assertSecureConfig() {
  const problems = [
    process.env.ENABLE_JWT !== '1' && 'ENABLE_JWT ist nicht "1"',
    secretProblem('JWT_SECRET'),
    secretProblem('COOKIE_SIGN_SECRET'),
    !process.env.CLIENT_BASE_URL && 'CLIENT_BASE_URL fehlt',
  ].filter(Boolean);
  if (problems.length === 0) return;
  if (isDevEnv()) {
    problems.forEach((p) => console.warn(`[SECURITY] ${p} (nur in development/test erlaubt)`));
    return;
  }
  problems.forEach((p) => console.error(`[SECURITY] ${p}`));
  console.error('[SECURITY] Start abgebrochen (NODE_ENV=%s).', process.env.NODE_ENV);
  process.exit(1);
}

const stripSlash = (url) => url.trim().replace(/\/+$/, '');

// SEC-11: Links in Mails nur aus der Konfiguration, nie aus Origin/Host der Anfrage.
export const clientBaseUrl = () =>
  stripSlash(process.env.CLIENT_BASE_URL || 'http://localhost:5173');

// SEC-26: CORS/WebSocket-Whitelist. CORS_ORIGIN (alt) und CORS_ALLOWED_ORIGINS (kommasepariert) ergänzen.
function allowedOrigins() {
  return [
    process.env.CLIENT_BASE_URL,
    process.env.CORS_ORIGIN,
    ...(process.env.CORS_ALLOWED_ORIGINS || '').split(','),
  ]
    .filter((origin) => origin && origin.trim())
    .map(stripSlash);
}

export function isAllowedOrigin(origin, host) {
  if (!origin) return true; // kein Browser-Cross-Origin-Request
  if (allowedOrigins().includes(stripSlash(origin))) return true;
  // Gleicher Origin (Client und API hinter demselben Host, z. B. Traefik-Pfadrouting).
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch (error) {
    return false;
  }
}

// SEC-26/43: Cookie-Flags unabhängig von NODE_ENV.
export const REFRESH_COOKIE_MAX_AGE = 86400 * 30 * 1000;
export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  signed: true,
  path: '/',
  maxAge: REFRESH_COOKIE_MAX_AGE,
});
// SEC-26: Der Client merkt sich die Aktivierung im localStorage und liest das Cookie nicht mehr.
// Session-Cookie wie bisher (kein maxAge).
export const eventUserAuthCookieOptions = () => ({
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  signed: true,
  path: '/',
});

const PASSWORD_MIN_LENGTH = 10;
export function assertPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`);
  }
  if (password.length > 256) {
    throw new Error('Das Passwort ist zu lang.');
  }
}

// SEC-44: Zustandsändernde Requests ohne Token (Logout) nur vom eigenen Site.
export function isSameSiteRequest(req) {
  const site = req.get('sec-fetch-site');
  if (['same-origin', 'same-site', 'none'].includes(site)) return true;
  const origin = req.get('origin');
  if (site === 'cross-site') return Boolean(origin) && isAllowedOrigin(origin, req.get('host'));
  return isAllowedOrigin(origin, req.get('host')); // ältere Browser ohne Fetch-Metadata
}

// Kleiner In-Memory-Limiter (Fixed Window) – reicht für eine Instanz, keine Zusatz-Abhängigkeit.
export function rateLimit({ windowMs, max, key = (req) => req.ip, name = 'request' }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const k = `${name}:${key(req)}`;
    const count = (hits.get(k) || 0) + 1;
    hits.set(k, count);
    if (count > max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ success: false, error: 'Too many requests' });
    }
    next();
  };
}
