import "dotenv/config";
import "regenerator-runtime";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { query } from "../lib/database";
import addStandaloneRequests from "./standalone-requests";
import { context, pubsub, yoga } from "./graphql";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { createServer } from "node:http";
import { extractCookieValueByHeader } from "../lib/cookie-from-string-util";
import { toggleUserOnlineStateByRequestToken } from "../repository/event-user-repository";
import authenticate from "../middleware/authenticate";

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
  app.use(authenticate);
  app.use(cookieParser(process.env.COOKIE_SIGN_SECRET));
  app.use(express.json());

  // Additional routes.
  addStandaloneRequests(app);

  app.use(process.env.GRAPHQL_ENDPOINT, yoga);

  const wsServer = new WebSocketServer({
    server: server,
    path: process.env.WEBSOCKET_ENDPOINT,
  });

  // Integrate Yoga's Envelop instance and NodeJS server with graphql-ws
  useServer(
    {
      execute: (args) => args.rootValue.execute(args),
      subscribe: (args) => args.rootValue.subscribe(args),
      onSubscribe: async (ctx, msg) => {
        const { schema, execute, subscribe, contextFactory, parse, validate } =
          yoga.getEnveloped({
            ...ctx,
            req: ctx.extra.request,
            socket: ctx.extra.socket,
            params: msg.payload,
          });

        const args = {
          schema,
          operationName: msg.payload.operationName,
          document: parse(msg.payload.query),
          variableValues: msg.payload.variables,
          contextValue: await contextFactory(),
          rootValue: {
            execute,
            subscribe,
          },
        };

        const errors = validate(args.schema, args.document);
        if (errors.length) return errors;
        return args;
      },
      onConnect: async (ctx) => {
        console.log("[INFO] User connected");
        if (!ctx.extra.request.headers.cookie) {
          return;
        }

        const token = extractCookieValueByHeader(
          ctx.extra.request.headers.cookie,
          "refreshToken",
        );
        if (token === null) {
          return;
        }

        const tokenRecord = await toggleUserOnlineStateByRequestToken(
          token,
          true,
        );
        if (!tokenRecord) {
          return;
        }

        if (tokenRecord.eventUserId) {
          console.log(tokenRecord, " eventUserLifeCycle");

          pubsub.publish("eventUserLifeCycle", {
            online: true,
            eventUserId: tokenRecord.eventUserId,
          });
        }
      },
      onDisconnect: async (ctx) => {
        console.log("[INFO] User disconnected!");
        if (!ctx.extra.request.headers.cookie) {
          return;
        }
        const token = extractCookieValueByHeader(
          ctx.extra.request.headers.cookie,
          "refreshToken",
        );
        if (token === null) {
          return;
        }
        const tokenRecord = await toggleUserOnlineStateByRequestToken(
          token,
          false,
        );
        if (!tokenRecord) {
          return;
        }
        if (tokenRecord.eventUserId) {
          pubsub.publish("eventUserLifeCycle", {
            online: false,
            eventUserId: tokenRecord.eventUserId,
          });
        }
      },
    },
    wsServer,
  );

  server.listen(process.env.APP_PORT, () => {
    console.log("----------------------------");
    console.log("Voting service API");
    console.log("----------------------------");
    console.log(
      `Running API Server at http://localhost:${process.env.APP_PORT}${process.env.GRAPHQL_ENDPOINT}`,
    );
    console.log(
      `Running WS Server at ws://localhost:${process.env.APP_PORT}${process.env.WEBSOCKET_ENDPOINT}`,
    );
  });
}

function resetEventUserOnlineState() {
  // Set each event user to offline on server start up.
  query("UPDATE event_user SET online = ?", [false]).catch((error) => {
    console.error(error);
  });
}
