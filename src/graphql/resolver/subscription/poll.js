import { pubsub } from "../../../server/graphql";
import { filter, pipe } from "graphql-yoga";
import { POLL_LIFE_CYCLE } from "./subscription-types";

export default {
  [POLL_LIFE_CYCLE]: {
    subscribe: (_, args, context) => {
      // Log subscription to help with debugging
      console.log(`[POLL_LIFECYCLE] Subscription started for event ${args.eventId} by user ${context.user?.id || 'unknown'}`);
      
      // Use pipe for filtering but with improved debugging
      return pipe(
        pubsub.subscribe(POLL_LIFE_CYCLE),
        filter((payload) => {
          // Always require eventId filtering to prevent unnecessary message delivery
          if (!args.eventId || !payload.eventId) {
            console.warn(`[POLL_LIFECYCLE] Missing eventId in filter or payload`, {
              argsEventId: args.eventId, 
              payloadEventId: payload.eventId
            });
            return false;
          }
          
          // Use strict equality check with parseInt for numeric comparison
          const isMatch = parseInt(payload.eventId, 10) === parseInt(args.eventId, 10);
          
          // Log all incoming events for this subscription to help with debugging
          if (payload.state === "closed") {
            console.log(`[POLL_LIFECYCLE] Received "${payload.state}" event for poll ${payload.pollResultId}, match=${isMatch}`);
          }
          
          return isMatch;
        }),
      );
    },
    resolve: (payload) => {
      // Ensure we don't return more data than needed
      if (!payload) return null;
      
      // Log critical state changes for debugging
      if (payload.state === "closed") {
        console.log(`[POLL_LIFECYCLE] Resolving "closed" event for poll ${payload.pollResultId} in event ${payload.eventId}`);
      }
      
      // Return only the fields clients need, with defaults for safety
      const result = {
        eventId: payload.eventId,
        state: payload.state || 'unknown',
        poll: payload.poll || null,
        pollResultId: payload.pollResultId,
        // Add timestamp to help with debugging and ensure clients have fresh data
        timestamp: Date.now()
      };
      
      return result;
    },
  },
};
