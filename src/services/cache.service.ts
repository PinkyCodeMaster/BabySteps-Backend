import Redis from "ioredis";
import { logger } from '../lib/logger';

/**
 * Cache Service
 * 
 * Provides caching functionality using Redis for expensive calculations.
 * Implements cache invalidation strategies to ensure data consistency.
 * 
 * Cache Strategy:
 * - Snowball calculations: 5 minute TTL
 * - Debt-free date projections: 5 minute TTL
 * - Disposable income: 5 minute TTL
 * - Invalidate on financial data changes (income, expense, debt CRUD)
 * 
 * Requirements: 6.5
 */

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

export class CacheService {
  private client: Redis | null = null;
  private enabled: boolean = false;

  constructor(config?: CacheConfig) {
    // Only initialize Redis if config is provided
    if (config) {
      try {
        this.client = new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db || 0,
          keyPrefix: config.keyPrefix || "debt-snowball:",
          retryStrategy: (times: number) => {
            // Retry with exponential backoff, max 3 seconds
            const delay = Math.min(times * 50, 3000);
            return delay;
          },
          maxRetriesPerRequest: 3,
        });

        this.client.on("error", (err) => {
          logger.error({ err }, "Redis connection error");
          this.enabled = false;
        });

        this.client.on("connect", () => {
          logger.info("Redis connected successfully");
          this.enabled = true;
        });

        this.enabled = true;
      } catch (error) {
        logger.error({ err: error }, "Failed to initialize Redis");
        this.enabled = false;
      }
    }
  }

  /**
   * Check if caching is enabled and Redis is connected
   */
  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Get a value from cache
   * 
   * @param key - Cache key
   * @returns Cached value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isEnabled() || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error({ err: error, key }, "Cache get error");
      return null;
    }
  }

  /**
   * Set a value in cache with TTL
   * 
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlSeconds - Time to live in seconds
   */
  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttlSeconds, serialized);
    } catch (error) {
      logger.error({ err: error, key }, "Cache set error");
    }
  }

  /**
   * Delete a specific key from cache
   * 
   * @param key - Cache key to delete
   */
  async delete(key: string): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error({ err: error, key }, "Cache delete error");
    }
  }

  /**
   * Delete all keys matching a pattern
   * 
   * @param pattern - Pattern to match (e.g., "org:123:*")
   */
  async deletePattern(pattern: string): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      return;
    }

    try {
      // Get all keys matching the pattern
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        // Delete all matching keys
        await this.client.del(...keys);
      }
    } catch (error) {
      logger.error({ err: error, pattern }, "Cache delete pattern error");
    }
  }

  /**
   * Invalidate all calculation caches for an organization
   * 
   * This should be called when:
   * - Income is created, updated, or deleted
   * - Expense is created, updated, or deleted
   * - Debt is created, updated, deleted, or payment recorded
   * 
   * @param orgId - Organization ID
   */
  async invalidateOrgCalculations(orgId: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      // Delete all calculation caches for this organization
      await Promise.all([
        this.delete(this.getSnowballKey(orgId)),
        this.delete(this.getDebtFreeDateKey(orgId)),
        this.delete(this.getDisposableIncomeKey(orgId)),
      ]);
    } catch (error) {
      logger.error({ err: error, orgId }, "Cache invalidation error");
    }
  }

  /**
   * Get cache key for snowball calculation
   */
  getSnowballKey(orgId: string): string {
    return `snowball:${orgId}`;
  }

  /**
   * Get cache key for debt-free date calculation
   */
  getDebtFreeDateKey(orgId: string): string {
    return `debt-free-date:${orgId}`;
  }

  /**
   * Get cache key for disposable income calculation
   */
  getDisposableIncomeKey(orgId: string): string {
    return `disposable-income:${orgId}`;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.enabled = false;
    }
  }
}

// Create singleton instance
// Redis is optional - if REDIS_URL is not provided, caching is disabled
let cacheServiceInstance: CacheService;

export function initializeCacheService(config?: CacheConfig): CacheService {
  cacheServiceInstance = new CacheService(config);
  return cacheServiceInstance;
}

export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    // Initialize with no config (caching disabled)
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}

export const cacheService = getCacheService();
