/* global Map */
/**
 * Cache for poll results to improve performance after polls are closed
 * This module provides caching for poll results data to reduce database load
 */

// no-console-check

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

  console.log(
    `[INFO:CACHE] Cached poll result ${pollResultId}, expires in ${ttlMs / 1000} seconds`
  );
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
 * Removes expired entries from the cache
 * @returns {number} - Number of entries removed
 */
function cleanupExpiredPollResultCache() {
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
