import "dotenv/config";
import "regenerator-runtime";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { query } from "../lib/database";
import addStandaloneRequests from "./standalone-requests";
import { context, yoga } from "./graphql";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { createServer } from "node:http";
import authenticate from "../middleware/authenticate";
import {
  onConnectWebsocket,
  onDisconnectWebsocket,
  onSubscribeWebsocket,
} from "../auth/websocket-events";
import { startInactivityCleanup, stopInactivityCleanup } from "../services/inactivity-cleanup";

// Handle für den Inaktivitäts-Cleanup-Timer
let inactivityCleanupInterval = null;

export default function () {
  resetEventUserOnlineState();
  const app = express();

  const server = createServer(app);

  // Add middlewares.
  app.use(
    cors({
      credentials: true,
      origin: function (origin, callback) {
        // We allow all origins to access this server for now.
        return callback(null, origin);
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      exposedHeaders: ['Content-Range', 'X-Content-Range'],
      maxAge: 600,
    }),
  );
  app.use((req, res, next) => {
    context.req = req;
    next();
  });
  app.use(cookieParser(process.env.COOKIE_SIGN_SECRET));
  app.use(express.json());

  // Apply authentication after body parsing
  app.use(authenticate);

  // Additional routes.
  addStandaloneRequests(app);

  app.use(process.env.GRAPHQL_ENDPOINT, yoga);

  const wsServer = new WebSocketServer({
    server: server,
    path: process.env.WEBSOCKET_ENDPOINT || '/graphql', // Use WEBSOCKET_ENDPOINT from env
    // Erlaube Cross-Origin-Verbindungen
    handleProtocols: (protocols) => {
      // Accept any protocol
      return protocols[0];
    },
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024
      },
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      serverMaxWindowBits: 10,
      concurrencyLimit: 10,
      threshold: 1024
    }
  });

  // Verbesserte Header für WebSocket-Verbindungen
  wsServer.on('connection', (socket, request) => {
    // Erlaube explizit CORS für WebSockets
    socket.on('headers', (headers) => {
      headers.push('Access-Control-Allow-Origin: *');
      headers.push('Access-Control-Allow-Methods: GET, POST, OPTIONS');
      headers.push('Access-Control-Allow-Headers: Content-Type, Authorization');
    });
  });

  // Integrate Yoga's Envelop instance and Node.js server with graphql-ws
  useServer(
    {
      execute: (args) => args.rootValue.execute(args),
      subscribe: (args) => args.rootValue.subscribe(args),
      onSubscribe: onSubscribeWebsocket,
      onConnect: (ctx) => {
        // Erweitere den onConnect-Callback um zusätzliche Header-Prüfungen zu vermeiden
        const connectionParams = ctx.connectionParams || {};
        
        // Akzeptiere alle Verbindungen, unabhängig von Headers
        return onConnectWebsocket(ctx);
      },
      onDisconnect: onDisconnectWebsocket,
      // Erhöhe Timeouts für stabilere Verbindungen
      connectionInitWaitTimeout: 60000, // 60 Sekunden Timeout für die Verbindungsinitialisierung
    },
    wsServer,
  );

  server.listen(process.env.APP_PORT, '0.0.0.0', () => {
    console.info("----------------------------");
    console.info("Voting service API");
    console.info("----------------------------");
    console.info(
      `Running API Server at http://0.0.0.0:${process.env.APP_PORT}${process.env.GRAPHQL_ENDPOINT}`,
    );
    console.info(
      `Running WS Server at ws://0.0.0.0:${process.env.APP_PORT}${process.env.WEBSOCKET_ENDPOINT}`,
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
  query("UPDATE event_user SET online = ?, last_activity = NULL", [false]).catch((error) => {
    console.error(error);
  });
}
