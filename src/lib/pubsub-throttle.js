/**
 * PubSub throttling utility to prevent flooding subscribers with too many events
 * Implements throttling, debouncing, and batching for GraphQL PubSub events
 */

class ThrottledPubSub {
  constructor(pubsub) {
    this.pubsub = pubsub;
    this.throttleCache = new Map();
    this.batchQueues = new Map();
    this.debounceTimers = new Map();
    this.stateCache = new Map();

    // Default options
    this.defaultOptions = {
      throttleMs: 1000,    // Min time between messages (1 second default)
      batchSize: 10,       // Number of events to batch before publishing
      debounceMs: 2000,    // Wait time for collecting events before sending batch
      cacheState: true,    // Cache last state to avoid sending duplicates 
      compareFields: null, // Fields to use for state comparison (null = compare all)
      skipIfEqual: true    // Skip sending if payload is equal to previous state
    };
  }

  /**
   * Publish an event with throttling, to prevent flooding subscribers
   * 
   * @param {string} eventName - The event channel name to publish to
   * @param {Object} payload - The data to publish
   * @param {Object} options - Throttling options
   * @returns {boolean} - True if published, false if throttled/cached
   */
  publish(eventName, payload, options = {}) {
    // Merge with default options
    const config = { ...this.defaultOptions, ...options };
    
    // Handle priority events immediately without throttling or debouncing
    // This is critical for important state updates like poll closings
    if (config.priority === true) {
      console.log(`[PUBSUB] Priority event for ${eventName}: ${JSON.stringify(config.filterBy || {})}`);
      // Still update the state cache if requested
      if (config.cacheState) {
        const cacheKey = `${eventName}${config.filterBy ? '-' + JSON.stringify(config.filterBy) : ''}`;
        this.stateCache.set(cacheKey, { ...payload });
      }
      // Directly publish to underlying pubsub
      this.pubsub.publish(eventName, payload);
      return true;
    }
    
    // Generate a cache key for this event
    const cacheKey = `${eventName}${config.filterBy ? '-' + JSON.stringify(config.filterBy) : ''}`;
    
    // Check if we should apply state caching to avoid duplicates
    if (config.cacheState) {
      const previousState = this.stateCache.get(cacheKey);
      
      // If no specific fields are defined for comparison, compare the entire payload
      if (config.skipIfEqual && previousState) {
        const fieldsToCompare = config.compareFields || Object.keys(payload);
        
        // Check if all fields to compare are equal
        const isEqual = fieldsToCompare.every(field => {
          return JSON.stringify(previousState[field]) === JSON.stringify(payload[field]);
        });
        
        // Skip publishing if state hasn't changed
        if (isEqual) {
          return false;
        }
      }
      
      // Update the state cache
      this.stateCache.set(cacheKey, { ...payload });
    }
    
    // Skip throttling if throttleMs is 0 (immediate delivery)
    if (config.throttleMs === 0 && config.debounceMs === 0) {
      this.pubsub.publish(eventName, payload);
      return true;
    }
    
    // Check if we're in batch mode
    if (config.batchMode) {
      return this.enqueueBatch(eventName, payload, config);
    }
    
    // Check if we should debounce instead of throttle
    if (config.debounceMs > 0) {
      return this.publishWithDebounce(eventName, payload, config, cacheKey);
    }
    
    // Apply throttling
    return this.publishWithThrottle(eventName, payload, config, cacheKey);
  }
  
  /**
   * Publish with simple throttling - limit to one event per throttleMs
   */
  publishWithThrottle(eventName, payload, config, cacheKey) {
    const now = Date.now();
    const lastPublishTime = this.throttleCache.get(cacheKey) || 0;
    
    // If we're within the throttle window, skip this publish
    if (now - lastPublishTime < config.throttleMs) {
      return false;
    }
    
    // Update the last publish time
    this.throttleCache.set(cacheKey, now);
    
    // Actually publish the event
    this.pubsub.publish(eventName, payload);
    return true;
  }
  
  /**
   * Publish with debouncing - wait for debounceMs before publishing
   * This collects rapid events and only sends the last one
   */
  publishWithDebounce(eventName, payload, config, cacheKey) {
    // Clear any existing timer
    if (this.debounceTimers.has(cacheKey)) {
      clearTimeout(this.debounceTimers.get(cacheKey));
    }
    
    // Set a new timer
    const timer = setTimeout(() => {
      this.pubsub.publish(eventName, payload);
      this.debounceTimers.delete(cacheKey);
    }, config.debounceMs);
    
    // Store the timer
    this.debounceTimers.set(cacheKey, timer);
    return true;
  }
  
  /**
   * Add event to a batch queue and publish when batch size is reached
   */
  enqueueBatch(eventName, payload, config) {
    const batchKey = `${eventName}${config.batchKey ? '-' + config.batchKey : ''}`;
    
    // Initialize batch if it doesn't exist
    if (!this.batchQueues.has(batchKey)) {
      this.batchQueues.set(batchKey, {
        eventName,
        items: [],
        timer: null
      });
      
      // Set a timer to flush the batch after debounceMs
      if (config.debounceMs > 0) {
        const timer = setTimeout(() => {
          this.flushBatch(batchKey);
        }, config.debounceMs);
        
        this.batchQueues.get(batchKey).timer = timer;
      }
    }
    
    const batch = this.batchQueues.get(batchKey);
    
    // Add the item to the batch
    batch.items.push(payload);
    
    // If we've reached the batch size, flush it
    if (batch.items.length >= config.batchSize) {
      this.flushBatch(batchKey);
    }
    
    return true;
  }
  
  /**
   * Flush a batch queue and publish the combined event
   */
  flushBatch(batchKey) {
    const batch = this.batchQueues.get(batchKey);
    if (!batch || batch.items.length === 0) {
      return;
    }
    
    // Clear any timer
    if (batch.timer) {
      clearTimeout(batch.timer);
    }
    
    // Create a batch payload
    const batchPayload = {
      batchItems: [...batch.items],
      batchSize: batch.items.length,
      timestamp: Date.now()
    };
    
    // Publish the batch
    this.pubsub.publish(batch.eventName, batchPayload);
    
    // Clear the batch
    this.batchQueues.delete(batchKey);
  }
  
  /**
   * Subscribe to an event (pass-through to underlying pubsub)
   */
  subscribe(eventName) {
    return this.pubsub.subscribe(eventName);
  }
  
  /**
   * Clear all throttle caches and timers
   */
  clearCaches() {
    this.throttleCache.clear();
    
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    
    // Flush and clear all batches
    for (const batchKey of this.batchQueues.keys()) {
      this.flushBatch(batchKey);
    }
    
    // Clear state cache
    this.stateCache.clear();
  }
}

module.exports = ThrottledPubSub;