import { Context, Next } from 'hono';
import { logger } from '../lib/logger';

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get log level based on status code
 */
function getLogLevel(status: number): 'info' | 'warn' | 'error' {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

/**
 * Request logging middleware
 * 
 * Logs incoming requests with:
 * - Request ID (for tracing)
 * - HTTP method and path
 * - User ID (if authenticated)
 * - Organization ID (if authenticated)
 * - Response status code
 * - Request duration
 * 
 * Adds X-Request-Id header to responses for client-side tracing
 */
export const requestLogger = () => {
  return async (c: Context, next: Next) => {
    const requestId = generateRequestId();
    const startTime = Date.now();
    
    // Store request ID in context for use in other middleware/handlers
    c.set('requestId', requestId);
    
    // Add request ID to response headers
    c.header('X-Request-Id', requestId);
    
    // Get request details
    const method = c.req.method;
    const path = c.req.path;
    
    // Log incoming request
    logger.debug({
      requestId,
      method,
      path,
      userAgent: c.req.header('user-agent'),
    }, 'Incoming request');
    
    try {
      // Process request
      await next();
      
      // Calculate duration
      const duration = Date.now() - startTime;
      const status = c.res.status;
      
      // Get user context if available (set by auth middleware)
      const userId = c.get('userId');
      const organizationId = c.get('organizationId');
      
      // Determine log level based on status code
      const logLevel = getLogLevel(status);
      
      // Log response with structured data
      logger[logLevel]({
        requestId,
        method,
        path,
        status,
        duration,
        userId,
        organizationId,
      }, 'Request completed');
      
      // Log warning for slow requests (>1s)
      if (duration > 1000) {
        logger.warn({
          requestId,
          method,
          path,
          duration,
        }, 'Slow request detected');
      }
    } catch (error) {
      // Calculate duration even on error
      const duration = Date.now() - startTime;
      
      // Log error (error handler will log full details)
      logger.error({
        requestId,
        method,
        path,
        duration,
      }, 'Request failed with error');
      
      // Re-throw to let error handler middleware handle it
      throw error;
    }
  };
};
