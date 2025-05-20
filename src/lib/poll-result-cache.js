/**
 * Cache for poll results to improve performance after polls are closed
 * This module provides caching for poll results data to reduce database load
 */

// Cache for closed poll results (Map of pollResultId -> cached data)
const pollResultCache = new Map();

// TTL cache settings (automatically expire cache entries)
const CACHE_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour cache TTL
const cacheExpiryTimes = new Map(); // Map of pollResultId -> expiry timestamp

/**
 * Sets a poll result in the cache
 * @param {number} pollResultId - The ID of the poll result
 * @param {Object} data - The data to cache
 * @param {number} [ttlMs] - Custom TTL in milliseconds (optional)
 */
export function setPollResultCache(pollResultId, data, ttlMs = CACHE_TTL_MS) {
  // Prevent caching null/undefined values
  if (!data) return;
  
  pollResultId = Number(pollResultId);
  
  // Don't cache if the poll is not closed
  if (data.closed !== 1 && data.closed !== true) return;
  
  // Store in cache
  pollResultCache.set(pollResultId, JSON.parse(JSON.stringify(data)));
  
  // Set expiry time
  const expiryTime = Date.now() + ttlMs;
  cacheExpiryTimes.set(pollResultId, expiryTime);
  
  console.log(`[INFO:CACHE] Cached poll result ${pollResultId}, expires in ${ttlMs/1000} seconds`);
}

/**
 * Gets a poll result from the cache if available
 * @param {number} pollResultId - The ID of the poll result
 * @returns {Object|null} - The cached data or null if not in cache or expired
 */
export function getPollResultCache(pollResultId) {
  pollResultId = Number(pollResultId);
  
  // Check if in cache
  if (!pollResultCache.has(pollResultId)) {
    return null;
  }
  
  // Check if expired
  const expiryTime = cacheExpiryTimes.get(pollResultId);
  if (expiryTime && Date.now() > expiryTime) {
    // Clear expired entry
    pollResultCache.delete(pollResultId);
    cacheExpiryTimes.delete(pollResultId);
    return null;
  }
  
  // Return deep copy of cached data to prevent modification
  return JSON.parse(JSON.stringify(pollResultCache.get(pollResultId)));
}

/**
 * Invalidates a specific poll result cache entry
 * @param {number} pollResultId - The ID of the poll result to invalidate
 */
export function invalidatePollResultCache(pollResultId) {
  pollResultId = Number(pollResultId);
  
  if (pollResultCache.has(pollResultId)) {
    pollResultCache.delete(pollResultId);
    cacheExpiryTimes.delete(pollResultId);
    console.log(`[INFO:CACHE] Invalidated cache for poll result ${pollResultId}`);
  }
}

/**
 * Invalidates all poll results for a specific event
 * @param {number} eventId - The ID of the event
 * @param {Array} [pollResultIds] - Optional array of poll result IDs belonging to this event
 */
export function invalidateEventPollResultsCache(eventId, pollResultIds) {
  let count = 0;
  
  // If we have the list of poll result IDs, use it directly
  if (Array.isArray(pollResultIds) && pollResultIds.length > 0) {
    pollResultIds.forEach(id => {
      if (pollResultCache.has(Number(id))) {
        pollResultCache.delete(Number(id));
        cacheExpiryTimes.delete(Number(id));
        count++;
      }
    });
  } else {
    // Otherwise, iterate through all cache entries and check eventId
    for (const [id, data] of pollResultCache.entries()) {
      if (data.poll && data.poll.eventId === eventId) {
        pollResultCache.delete(id);
        cacheExpiryTimes.delete(id);
        count++;
      }
    }
  }
  
  if (count > 0) {
    console.log(`[INFO:CACHE] Invalidated ${count} cache entries for event ${eventId}`);
  }
}

/**
 * Gets the current cache stats
 * @returns {Object} - Cache statistics
 */
export function getPollResultCacheStats() {
  return {
    totalEntries: pollResultCache.size,
    memoryUsageBytes: estimateCacheSize(),
    oldestEntryAge: getOldestEntryAge()
  };
}

/**
 * Clears all entries from the cache
 */
export function clearPollResultCache() {
  const count = pollResultCache.size;
  pollResultCache.clear();
  cacheExpiryTimes.clear();
  console.log(`[INFO:CACHE] Cleared ${count} entries from poll result cache`);
}

/**
 * Removes expired entries from the cache
 * @returns {number} - Number of entries removed
 */
export function cleanupExpiredPollResultCache() {
  let count = 0;
  const now = Date.now();
  
  for (const [id, expiryTime] of cacheExpiryTimes.entries()) {
    if (now > expiryTime) {
      pollResultCache.delete(id);
      cacheExpiryTimes.delete(id);
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`[INFO:CACHE] Cleaned up ${count} expired cache entries`);
  }
  
  return count;
}

// Set up automatic periodic cleanup
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
setInterval(cleanupExpiredPollResultCache, CLEANUP_INTERVAL_MS);

// Helper function to estimate cache size in bytes (rough approximation)
function estimateCacheSize() {
  let totalSize = 0;
  
  for (const [id, data] of pollResultCache.entries()) {
    // Estimate base size of key (number = 8 bytes)
    totalSize += 8;
    
    // Estimate size of value using JSON serialization (rough approximation)
    const jsonStr = JSON.stringify(data);
    totalSize += jsonStr.length * 2; // Unicode characters can be 2 bytes each
  }
  
  return totalSize;
}

// Helper function to get the age of the oldest entry in milliseconds
function getOldestEntryAge() {
  if (cacheExpiryTimes.size === 0) return 0;
  
  const now = Date.now();
  const oldestExpiryTime = Math.min(...cacheExpiryTimes.values());
  return Math.max(0, oldestExpiryTime - (now - CACHE_TTL_MS));
}