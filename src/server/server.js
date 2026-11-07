import 'dotenv/config';
import 'regenerator-runtime';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { query } from '../lib/database';
import addStandaloneRequests from './standalone-requests';
import { yoga } from './graphql';
import { assertSecureConfig, isAllowedOrigin, rateLimit } from './security';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import { createServer } from 'node:http';
import authenticate from '../middleware/authenticate';
import {
  onConnectWebsocket,
  onDisconnectWebsocket,
  onSubscribeWebsocket,
} from '../auth/websocket-events';
import { startInactivityCleanup, stopInactivityCleanup } from '../services/inactivity-cleanup';

// Handle für den Inaktivitäts-Cleanup-Timer
let inactivityCleanupInterval = null;

export default function () {
  assertSecureConfig();
  resetEventUserOnlineState();
  const app = express();
  app.disable('x-powered-by');
  // SEC-35: Hinter Traefik (1 Hop) kommt die Client-IP aus X-Forwarded-For. Ohne Proxy
  // TRUST_PROXY=0 setzen, sonst lässt sich die IP für das Rate-Limit fälschen.
  const trustProxy = process.env.TRUST_PROXY ?? '1';
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  const server = createServer(app);

  // Add middlewares.
  // SEC-26: nur bekannte Origins (CLIENT_BASE_URL, CORS_ORIGIN, CORS_ALLOWED_ORIGINS) mit Credentials.
  app.use((req, res, next) =>
    cors({
      credentials: true,
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin, req.get('host'))),
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      exposedHeaders: ['Content-Range', 'X-Content-Range'],
      maxAge: 600,
    })(req, res, next)
  );
  app.use(cookieParser(process.env.COOKIE_SIGN_SECRET));
  app.use(express.json({ limit: '1mb' }));

  // SEC-35: Rate-Limits je IP. Großzügig, weil ganze Versammlungen hinter einer NAT-IP sitzen.
  const minute = 60 * 1000;
  // Pro IP großzügig: ganze Versammlungen sitzen hinter einer NAT-IP (Saal-WLAN). Brute Force
  // bremst das Limit pro Benutzer darunter (10 / 15 min).
  const perIp = Number(process.env.LOGIN_RATE_LIMIT_PER_IP) || 2000;
  app.use('/login', rateLimit({ name: 'login', windowMs: minute, max: perIp }));
  app.post(
    ['/login', '/login/password-verify'],
    rateLimit({
      name: 'login-user',
      windowMs: 15 * minute,
      max: 10,
      key: (req) => `${req.ip}:${req.body?.loginType}:${req.body?.eventId}:${req.body?.username}`,
    })
  );
  app.use(
    [
      '/organizer/password-forgot',
      '/organizer/create',
      '/organizer/update-password',
      '/organizer/validate-hash',
    ],
    rateLimit({ name: 'organizer-public', windowMs: 15 * minute, max: 20 })
  );
  app.use('/api/shortlink', rateLimit({ name: 'shortlink', windowMs: minute, max: perIp }));
  app.use('/s/', rateLimit({ name: 'shortlink', windowMs: minute, max: perIp }));

  // Apply authentication after body parsing
  app.use(authenticate);

  // Additional routes.
  addStandaloneRequests(app);

  app.use(process.env.GRAPHQL_ENDPOINT, yoga);

  const wsServer = new WebSocketServer({
    server: server,
    path: process.env.WEBSOCKET_ENDPOINT || '/graphql', // Use WEBSOCKET_ENDPOINT from env
    // SEC-45: nur eigene Origins (Cross-Site-WebSocket-Hijacking) und nur das graphql-ws-Protokoll.
    verifyClient: ({ origin, req }) => isAllowedOrigin(origin, req.headers.host),
    handleProtocols: (protocols) =>
      protocols.has('graphql-transport-ws') ? 'graphql-transport-ws' : false,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3,
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024,
      },
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      serverMaxWindowBits: 10,
      concurrencyLimit: 10,
      threshold: 1024,
    },
  });

  // Integrate Yoga's Envelop instance and Node.js server with graphql-ws
  useServer(
    {
      execute: (args) => args.rootValue.execute(args),
      subscribe: (args) => args.rootValue.subscribe(args),
      onSubscribe: onSubscribeWebsocket,
      // SEC-16: false = Verbindung abgelehnt (4403), wenn der JWT nicht verifizierbar ist.
      onConnect: onConnectWebsocket,
      onDisconnect: onDisconnectWebsocket,
      // Erhöhe Timeouts für stabilere Verbindungen
      connectionInitWaitTimeout: 60000, // 60 Sekunden Timeout für die Verbindungsinitialisierung
    },
    wsServer
  );

  server.listen(process.env.APP_PORT, '0.0.0.0', () => {
    console.info('----------------------------');
    console.info('Voting service API');
    console.info('----------------------------');
    console.info(
      `Running API Server at http://0.0.0.0:${process.env.APP_PORT}${process.env.GRAPHQL_ENDPOINT}`
    );
    console.info(
      `Running WS Server at ws://0.0.0.0:${process.env.APP_PORT}${process.env.WEBSOCKET_ENDPOINT}`
    );

    // Starte den Inaktivitäts-Cleanup-Job nach dem Serverstart
    inactivityCleanupInterval = startInactivityCleanup();
  });

  // Bei Server-Shutdown den Cleanup-Job beenden
  process.on('SIGTERM', () => {
    stopInactivityCleanup(inactivityCleanupInterval);
  });

  process.on('SIGINT', () => {
    stopInactivityCleanup(inactivityCleanupInterval);
    process.exit(0);
  });
}

function resetEventUserOnlineState() {
  // Set each event user to offline on server start up.
  query('UPDATE event_user SET online = ?, last_activity = NULL', [false]).catch((error) => {
    console.error(error);
  });
}
