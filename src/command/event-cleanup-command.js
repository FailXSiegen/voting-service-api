import { performEventCleanup } from "../services/event-cleanup.js";

export default {
  name: "Event cleanup (every 4 hours)",
  interval: "0 */4 * * *", // Every 4 hours at minute 0
  active: true,
  execute: async () => {
    console.log("Starting scheduled event cleanup...");
    const result = await performEventCleanup();
    
    if (result.success) {
      const expiredCount = result.expiredEvents ? result.expiredEvents.length : 0;
      const removedCount = result.eventsToRemove ? result.eventsToRemove.length : 0;
      console.log(`Event cleanup completed: ${expiredCount} events marked for deletion, ${removedCount} events removed`);
    } else {
      console.error("Event cleanup failed:", result.error);
    }
  },
  options: {},
};