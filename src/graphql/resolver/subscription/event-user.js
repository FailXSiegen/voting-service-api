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

          // TEMPORARILY ALLOW ALL EVENTS THROUGH - FOR DEBUGGING ONLY
          return true;

          /*
          // Require event matching to prevent global broadcasts
          if (args.eventId && payload.eventId) {
            const match = parseInt(payload.eventId, 10) === parseInt(args.eventId, 10);
            return match;
          }
          
          // Fall back to eventUserId if event filtering not provided
          if (args.eventUserId && payload.eventUserId) {
            const match = parseInt(payload.eventUserId, 10) === parseInt(args.eventUserId, 10);
            return match;
          }
          
          return false;
          */
        }),
      ),
    resolve: (payload) => {
      // Return only required fields
      const result = {
        online: payload.online,
        eventUserId: payload.eventUserId,
        eventId: payload.eventId
      };
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
