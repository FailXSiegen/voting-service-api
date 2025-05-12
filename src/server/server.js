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
      methods: ["GET", "POST"],
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
    path: process.env.WEBSOCKET_ENDPOINT,
  });

  // Integrate Yoga's Envelop instance and Node.js server with graphql-ws
  useServer(
    {
      execute: (args) => args.rootValue.execute(args),
      subscribe: (args) => args.rootValue.subscribe(args),
      onSubscribe: onSubscribeWebsocket,
      onConnect: onConnectWebsocket,
      onDisconnect: onDisconnectWebsocket,
    },
    wsServer,
  );

  server.listen(process.env.APP_PORT, () => {
    console.info("----------------------------");
    console.info("Voting service API");
    console.info("----------------------------");
    console.info(
      `Running API Server at http://localhost:${process.env.APP_PORT}${process.env.GRAPHQL_ENDPOINT}`,
    );
    console.info(
      `Running WS Server at ws://localhost:${process.env.APP_PORT}${process.env.WEBSOCKET_ENDPOINT}`,
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
