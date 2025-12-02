import { Context, Next } from 'hono';

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get color for status code (for terminal output)
 */
function getStatusColor(status: number): string {
  if (status >= 500) return '\x1b[31m'; // Red
  if (status >= 400) return '\x1b[33m'; // Yellow
  if (status >= 300) return '\x1b[36m'; // Cyan
  if (status >= 200) return '\x1b[32m'; // Green
  return '\x1b[0m'; // Reset
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
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
    console.log(`📥 [${requestId}] ${method} ${path}`);
    
    try {
      // Process request
      await next();
      
      // Calculate duration
      const duration = Date.now() - startTime;
      const status = c.res.status;
      
      // Get user context if available (set by auth middleware)
      const userId = c.get('userId');
      const organizationId = c.get('organizationId');
      
      // Build log message
      const statusColor = getStatusColor(status);
      const resetColor = '\x1b[0m';
      
      const contextInfo = [];
      if (userId) contextInfo.push(`userId=${userId}`);
      if (organizationId) contextInfo.push(`orgId=${organizationId}`);
      
      const contextStr = contextInfo.length > 0 ? ` [${contextInfo.join(', ')}]` : '';
      
      // Log response
      console.log(
        `📤 [${requestId}] ${method} ${path} ${statusColor}${status}${resetColor} ${formatDuration(duration)}${contextStr}`
      );
      
      // Log detailed info for slow requests (>1s)
      if (duration > 1000) {
        console.warn(`⚠️  Slow request detected: ${method} ${path} took ${formatDuration(duration)}`);
      }
    } catch (error) {
      // Calculate duration even on error
      const duration = Date.now() - startTime;
      
      // Log error (error handler will log details)
      console.error(
        `❌ [${requestId}] ${method} ${path} ERROR ${formatDuration(duration)}`
      );
      
      // Re-throw to let error handler middleware handle it
      throw error;
    }
  };
};
