import { pubsub } from "../../../server/graphql";
import { filter, pipe } from "graphql-yoga";
import {
  UPDATE_EVENT_USER_ACCESS_RIGHTS,
  NEW_EVENT_USER,
  EVENT_USER_LIFE_CYCLE,
  TOKEN_REFRESH_REQUIRED,
} from "./subscription-types";

const isDev = process.env.NODE_ENV === 'development';

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
    subscribe: (_, args) => {
      if (isDev) {
        console.log('[DEBUG] event-user.js - NEW_EVENT_USER subscription requested with args:', args);
      }
      
      return pipe(
        pubsub.subscribe(NEW_EVENT_USER),
        filter((payload) => {
          if (isDev) {
            console.log('[DEBUG] event-user.js - NEW_EVENT_USER payload received:', {
              payloadEventId: payload.eventId,
              argsEventId: args.eventId,
              hasEventUser: !!payload.eventUser
            });
          }
          
          // Only send to the event they belong to
          if (!args.eventId || !payload.eventId) {
            if (isDev) {
              console.log('[DEBUG] event-user.js - NEW_EVENT_USER filtered out: missing eventId');
            }
            return false;
          }
          
          const match = parseInt(payload.eventId, 10) === parseInt(args.eventId, 10);
          if (isDev) {
            console.log('[DEBUG] event-user.js - NEW_EVENT_USER filter result:', match);
          }
          return match;
        }),
      );
    },
    resolve: (payload) => {
      if (isDev) {
        console.log('[DEBUG] event-user.js - NEW_EVENT_USER resolving payload:', payload);
      }
      
      // Return the event user directly if it's in the payload
      if (payload.eventUser) {
        return payload.eventUser;
      }
      
      // Fallback for backward compatibility
      return {
        eventId: payload.eventId,
        ...payload
      };
    },
  },
  [EVENT_USER_LIFE_CYCLE]: {
    subscribe: (_, args) => {
      if (isDev) {
        console.log('[DEBUG] event-user.js - EVENT_USER_LIFE_CYCLE subscription requested with args:', args);
      }
      
      return pipe(
        pubsub.subscribe(EVENT_USER_LIFE_CYCLE),
        filter((payload) => {
          if (isDev) {
            console.log('[DEBUG] event-user.js - EVENT_USER_LIFE_CYCLE payload received:', payload);
          }

          // Require event matching to prevent global broadcasts
          if (args.eventId && payload.eventId) {
            const match = parseInt(payload.eventId, 10) === parseInt(args.eventId, 10);
            if (isDev) {
              console.log('[DEBUG] event-user.js - EVENT_USER_LIFE_CYCLE filter by eventId:', {
                argsEventId: args.eventId,
                payloadEventId: payload.eventId,
                match
              });
            }
            return match;
          }
          
          // Fall back to eventUserId if event filtering not provided
          if (args.eventUserId && payload.eventUserId) {
            const match = parseInt(payload.eventUserId, 10) === parseInt(args.eventUserId, 10);
            if (isDev) {
              console.log('[DEBUG] event-user.js - EVENT_USER_LIFE_CYCLE filter by eventUserId:', {
                argsEventUserId: args.eventUserId,
                payloadEventUserId: payload.eventUserId,
                match
              });
            }
            return match;
          }
          
          if (isDev) {
            console.log('[DEBUG] event-user.js - EVENT_USER_LIFE_CYCLE filtered out: no matching criteria');
          }
          return false;
        }),
      );
    },
    resolve: (payload) => {
      if (isDev) {
        console.log('[DEBUG] event-user.js - EVENT_USER_LIFE_CYCLE resolving payload:', payload);
      }
      
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
