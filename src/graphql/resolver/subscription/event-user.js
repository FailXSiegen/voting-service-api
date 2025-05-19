import { pubsub } from "../../../server/graphql";
import { filter, pipe } from "graphql-yoga";
import {
  UPDATE_EVENT_USER_ACCESS_RIGHTS,
  NEW_EVENT_USER,
  EVENT_USER_LIFE_CYCLE,
  TOKEN_REFRESH_REQUIRED,
} from "./subscription-types";

export default {
  [UPDATE_EVENT_USER_ACCESS_RIGHTS]: {
    subscribe: (_, args) =>
      pipe(
        pubsub.subscribe(UPDATE_EVENT_USER_ACCESS_RIGHTS),
        filter((payload) => {
          // Require either eventUserId match or explicit organizer flag
          if (!args.eventUserId && args.isOrganizer === true) {
            return true; // Allow organizers to get notified without eventUserId
          }
          // Otherwise require eventUserId match
          return payload.eventUserId && args.eventUserId && 
                 (parseInt(payload.eventUserId, 10) === parseInt(args.eventUserId, 10));
        }),
      ),
    resolve: (payload) => payload,
  },
  [NEW_EVENT_USER]: {
    subscribe: (_, args) => 
      pipe(
        pubsub.subscribe(NEW_EVENT_USER),
        filter((payload) => {
          // Only send to the event they belong to
          if (!args.eventId || !payload.eventId) {
            return false;
          }
          return parseInt(payload.eventId, 10) === parseInt(args.eventId, 10);
        }),
      ),
    resolve: (payload) => {
      // Return minimal required information
      return {
        eventId: payload.eventId,
        eventUser: payload.eventUser
      };
    },
  },
  [EVENT_USER_LIFE_CYCLE]: {
    subscribe: (_, args) => 
      pipe(
        pubsub.subscribe(EVENT_USER_LIFE_CYCLE),
        filter((payload) => {
          // Debug logs for subscription filtering
          console.log("[DEBUG] EVENT_USER_LIFE_CYCLE filtering:", {
            payloadEventId: payload.eventId,
            argsEventId: args.eventId,
            payloadEventUserId: payload.eventUserId,
            argsEventUserId: args.eventUserId
          });
          
          // TEMPORARILY ALLOW ALL EVENTS THROUGH - FOR DEBUGGING ONLY
          console.log("[DEBUG] TEMPORARY: allowing all events through for debugging");
          return true;
          
          /*
          // Require event matching to prevent global broadcasts
          if (args.eventId && payload.eventId) {
            const match = parseInt(payload.eventId, 10) === parseInt(args.eventId, 10);
            console.log(`[DEBUG] Event ID filtering match: ${match}`);
            return match;
          }
          
          // Fall back to eventUserId if event filtering not provided
          if (args.eventUserId && payload.eventUserId) {
            const match = parseInt(payload.eventUserId, 10) === parseInt(args.eventUserId, 10);
            console.log(`[DEBUG] Event User ID filtering match: ${match}`);
            return match;
          }
          
          console.log("[DEBUG] No filtering match, discarding event");
          return false;
          */
        }),
      ),
    resolve: (payload) => {
      // Return only required fields
      console.log("[DEBUG] EVENT_USER_LIFE_CYCLE resolving payload:", payload);
      const result = {
        online: payload.online,
        eventUserId: payload.eventUserId,
        eventId: payload.eventId
      };
      console.log("[DEBUG] EVENT_USER_LIFE_CYCLE resolved to:", result);
      return result;
    },
  },
  [TOKEN_REFRESH_REQUIRED]: {
    subscribe: (_, args) =>
      pipe(
        pubsub.subscribe(TOKEN_REFRESH_REQUIRED),
        filter((payload) => {
          if (!args.eventUserId) {
            return false; // Require eventUserId to be specified
          }
          return parseInt(payload.eventUserId) === parseInt(args.eventUserId);
        }),
      ),
    resolve: (payload) => payload,
  },
};
