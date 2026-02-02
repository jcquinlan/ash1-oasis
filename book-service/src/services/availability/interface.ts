import type { SourceAdapter, AvailabilityRecord, BookFormat } from "../../types";

/**
 * Base class for source adapters with common functionality
 */
export abstract class BaseSourceAdapter implements SourceAdapter {
  abstract name: string;
  abstract rate_limit: { requests_per_minute: number };

  protected lastRequestTime: number = 0;
  protected requestCount: number = 0;
  protected requestWindowStart: number = Date.now();

  /**
   * Check availability for an ISBN
   */
  abstract check(isbn: string): Promise<AvailabilityRecord | null>;

  /**
   * Check if this source supports a specific format
   */
  abstract supports_format(format: BookFormat): boolean;

  /**
   * Rate limiting helper - call before making requests
   * Returns the number of milliseconds to wait (0 if no wait needed)
   */
  protected async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const windowDuration = 60 * 1000; // 1 minute in ms

    // Reset window if needed
    if (now - this.requestWindowStart > windowDuration) {
      this.requestWindowStart = now;
      this.requestCount = 0;
    }

    // Check if we've exceeded rate limit
    if (this.requestCount >= this.rate_limit.requests_per_minute) {
      const waitTime = windowDuration - (now - this.requestWindowStart);
      if (waitTime > 0) {
        await this.sleep(waitTime);
        this.requestWindowStart = Date.now();
        this.requestCount = 0;
      }
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  /**
   * Sleep helper for rate limiting
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retry helper with exponential backoff
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          console.log(
            `[${this.name}] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }
}

/**
 * Registry of all available source adapters
 */
const adapterRegistry = new Map<string, SourceAdapter>();

/**
 * Register a source adapter
 */
export function registerAdapter(adapter: SourceAdapter): void {
  adapterRegistry.set(adapter.name, adapter);
}

/**
 * Get a source adapter by name
 */
export function getAdapter(name: string): SourceAdapter | undefined {
  return adapterRegistry.get(name);
}

/**
 * Get all registered adapters
 */
export function getAllAdapters(): SourceAdapter[] {
  return Array.from(adapterRegistry.values());
}

/**
 * Get adapters that support a specific format
 */
export function getAdaptersForFormat(format: BookFormat): SourceAdapter[] {
  return getAllAdapters().filter((adapter) => adapter.supports_format(format));
}

/**
 * Get adapter names
 */
export function getAdapterNames(): string[] {
  return Array.from(adapterRegistry.keys());
}
