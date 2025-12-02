import { Context, Next } from 'hono';
import { AppError, ErrorCodes } from './errorHandler.middleware';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (c: Context) => string; // Custom key generator
}

/**
 * In-memory store for rate limiting
 * In production, consider using Redis for distributed rate limiting
 */
class RateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  
  /**
   * Increment request count for a key
   * Returns current count and reset time
   */
  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const existing = this.store.get(key);
    
    // If no existing entry or window expired, create new entry
    if (!existing || existing.resetTime < now) {
      const entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(key, entry);
      return entry;
    }
    
    // Increment existing entry
    existing.count++;
    this.store.set(key, existing);
    return existing;
  }
  
  /**
   * Clean up expired entries periodically
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (value.resetTime < now) {
        this.store.delete(key);
      }
    }
  }
}

// Global rate limit store
const rateLimitStore = new RateLimitStore();

// Cleanup expired entries every minute
setInterval(() => {
  rateLimitStore.cleanup();
}, 60000);

/**
 * Default key generator: uses IP address
 */
function defaultKeyGenerator(c: Context): string {
  // Try to get real IP from headers (for proxies/load balancers)
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0];
    if (firstIp) {
      return firstIp.trim();
    }
  }
  
  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  // Fallback to connection IP (Bun doesn't expose this easily, use a placeholder)
  return 'unknown-ip';
}

/**
 * User-based key generator: uses userId from context
 */
function userKeyGenerator(c: Context): string {
  const userId = c.get('userId') as string | undefined;
  return userId ? `user:${userId}` : defaultKeyGenerator(c);
}

/**
 * Rate limiting middleware factory
 * 
 * 
 * Creates a rate limiter with specified configuration
 * Tracks requests per key (IP or user) within a time window
 * Returns 429 error when limit is exceeded
 */
export const rateLimit = (config: RateLimitConfig) => {
  const keyGenerator = config.keyGenerator || defaultKeyGenerator;
  
  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const { count, resetTime } = rateLimitStore.increment(key, config.windowMs);
    
    // Set rate limit headers
    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, config.maxRequests - count).toString());
    c.header('X-RateLimit-Reset', new Date(resetTime).toISOString());
    
    // Check if limit exceeded
    if (count > config.maxRequests) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      c.header('Retry-After', retryAfter.toString());
      
      throw new AppError(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        'Too many requests, please try again later',
        429,
        {
          retryAfter,
          limit: config.maxRequests,
          windowMs: config.windowMs,
        }
      );
    }
    
    await next();
  };
};

/**
 * Pre-configured rate limiters for different endpoint types
 */

/**
 * Auth endpoints rate limiter: 5 requests per 15 minutes
 * Prevents brute force attacks on login/registration
 */
export const authRateLimit = () => rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  keyGenerator: defaultKeyGenerator, // Use IP-based limiting for auth
});

/**
 * Payment endpoints rate limiter: 10 requests per minute
 * Prevents accidental duplicate payments
 */
export const paymentRateLimit = () => rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  keyGenerator: userKeyGenerator, // Use user-based limiting
});

/**
 * Calculation endpoints rate limiter: 30 requests per minute
 * Prevents excessive computation load
 */
export const calculationRateLimit = () => rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  keyGenerator: userKeyGenerator, // Use user-based limiting
});

/**
 * General API rate limiter: 100 requests per minute
 * Prevents API abuse
 */
export const generalRateLimit = () => rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  keyGenerator: userKeyGenerator, // Use user-based limiting
});
