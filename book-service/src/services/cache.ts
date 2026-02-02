import type { CacheEntry, AvailabilityRecord } from "../types";
import { getConfig } from "../config";

// In-memory cache storage
const cache = new Map<string, CacheEntry<AvailabilityRecord | null>>();

/**
 * Generate a cache key from ISBN and source
 */
function getCacheKey(isbn: string, source: string): string {
  return `${isbn}:${source}`;
}

/**
 * Get cached availability record
 * Returns undefined if not found or expired
 */
export function getCachedAvailability(
  isbn: string,
  source: string
): AvailabilityRecord | null | undefined {
  const key = getCacheKey(isbn, source);
  const entry = cache.get(key);

  if (!entry) {
    return undefined; // Not in cache
  }

  // Check if expired
  if (Date.now() > entry.expires_at) {
    cache.delete(key);
    return undefined; // Expired
  }

  return entry.data; // Can be null (meaning "checked but not available")
}

/**
 * Set cached availability record
 * Pass null to cache a "not available" result
 */
export function setCachedAvailability(
  isbn: string,
  source: string,
  data: AvailabilityRecord | null,
  ttlHours?: number
): void {
  const config = getConfig();
  const ttl = ttlHours ?? config.cache_ttl_hours;
  const key = getCacheKey(isbn, source);

  const entry: CacheEntry<AvailabilityRecord | null> = {
    data,
    expires_at: Date.now() + ttl * 60 * 60 * 1000,
  };

  cache.set(key, entry);
}

/**
 * Check if an entry exists in cache (regardless of expiration)
 */
export function hasCacheEntry(isbn: string, source: string): boolean {
  const key = getCacheKey(isbn, source);
  return cache.has(key);
}

/**
 * Remove a specific entry from cache
 */
export function invalidateCacheEntry(isbn: string, source: string): boolean {
  const key = getCacheKey(isbn, source);
  return cache.delete(key);
}

/**
 * Clear all cached entries for a specific ISBN
 */
export function invalidateISBN(isbn: string): number {
  let count = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(`${isbn}:`)) {
      cache.delete(key);
      count++;
    }
  }
  return count;
}

/**
 * Clear all cached entries for a specific source
 */
export function invalidateSource(source: string): number {
  let count = 0;
  for (const key of cache.keys()) {
    if (key.endsWith(`:${source}`)) {
      cache.delete(key);
      count++;
    }
  }
  return count;
}

/**
 * Clear all expired entries
 */
export function pruneExpired(): number {
  let count = 0;
  const now = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (now > entry.expires_at) {
      cache.delete(key);
      count++;
    }
  }

  return count;
}

/**
 * Clear the entire cache
 */
export function clearCache(): number {
  const count = cache.size;
  cache.clear();
  return count;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  expired: number;
  valid: number;
} {
  const now = Date.now();
  let expired = 0;
  let valid = 0;

  for (const entry of cache.values()) {
    if (now > entry.expires_at) {
      expired++;
    } else {
      valid++;
    }
  }

  return {
    size: cache.size,
    expired,
    valid,
  };
}

/**
 * Get all cached entries (for debugging/inspection)
 */
export function getAllCacheEntries(): Array<{
  key: string;
  data: AvailabilityRecord | null;
  expires_at: Date;
  is_expired: boolean;
}> {
  const now = Date.now();
  const entries: Array<{
    key: string;
    data: AvailabilityRecord | null;
    expires_at: Date;
    is_expired: boolean;
  }> = [];

  for (const [key, entry] of cache.entries()) {
    entries.push({
      key,
      data: entry.data,
      expires_at: new Date(entry.expires_at),
      is_expired: now > entry.expires_at,
    });
  }

  return entries;
}
