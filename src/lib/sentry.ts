import * as Sentry from '@sentry/bun';
import { getConfig, isProduction, isDevelopment } from '../config';

/**
 * Initialize Sentry error tracking
 * 
 * Configures Sentry with environment-specific settings:
 * - Production: Full error tracking with sampling
 * - Development: Disabled by default (unless SENTRY_DSN is set)
 * - Test: Always disabled
 * 
 * Requirements: 10.4
 */
export function initializeSentry(): void {
  const config = getConfig();
  
  // Skip initialization in test environment
  if (config.NODE_ENV === 'test') {
    return;
  }
  
  // Skip if SENTRY_DSN is not configured
  if (!config.SENTRY_DSN) {
    if (isDevelopment()) {
      console.log('ℹ️  Sentry error tracking disabled (SENTRY_DSN not configured)');
    }
    return;
  }
  
  // Initialize Sentry
  Sentry.init({
    dsn: config.SENTRY_DSN,
    
    // Environment
    environment: config.NODE_ENV,
    
    // Release tracking (can be set via CI/CD)
    release: process.env['SENTRY_RELEASE'] || undefined,
    
    // Sample rate for error events (100% in production)
    sampleRate: isProduction() ? 1.0 : 1.0,
    
    // Sample rate for performance monitoring
    tracesSampleRate: isProduction() ? 0.1 : 0.0, // 10% in production, disabled in dev
    
    // Before sending events, scrub sensitive data
    beforeSend(event) {
      // Remove sensitive data from event
      if (event.request) {
        // Remove authorization headers
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        
        // Remove sensitive query parameters
        if (event.request.query_string && typeof event.request.query_string === 'string') {
          event.request.query_string = event.request.query_string
            .replace(/token=[^&]*/gi, 'token=[REDACTED]')
            .replace(/password=[^&]*/gi, 'password=[REDACTED]')
            .replace(/secret=[^&]*/gi, 'secret=[REDACTED]');
        }
      }
      
      // Remove sensitive data from extra context
      if (event.extra) {
        delete event.extra['password'];
        delete event.extra['passwordHash'];
        delete event.extra['token'];
        delete event.extra['sessionToken'];
      }
      
      return event;
    },
    
    // Ignore certain errors
    ignoreErrors: [
      // Browser/client errors that shouldn't be tracked
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      // Network errors
      'NetworkError',
      'Network request failed',
      // Expected validation errors
      'ValidationError',
      'ZodError',
    ],
  });
  
  console.log('✅ Sentry error tracking initialized');
}

/**
 * Capture an exception in Sentry
 * 
 * @param error - The error to capture
 * @param context - Additional context to attach to the error
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (context) {
    Sentry.withScope((scope) => {
      // Add context to the error
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value);
      });
      
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture a message in Sentry
 * 
 * @param message - The message to capture
 * @param level - The severity level
 * @param context - Additional context
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, any>
): void {
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value);
      });
      
      Sentry.captureMessage(message, level);
    });
  } else {
    Sentry.captureMessage(message, level);
  }
}

/**
 * Set user context for Sentry
 * 
 * @param user - User information to attach to errors
 */
export function setUserContext(user: {
  id: string;
  email?: string;
  organizationId?: string;
}): void {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    organizationId: user.organizationId,
  });
}

/**
 * Clear user context
 */
export function clearUserContext(): void {
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 * 
 * @param message - Breadcrumb message
 * @param category - Breadcrumb category
 * @param data - Additional data
 */
export function addBreadcrumb(
  message: string,
  category: string = 'custom',
  data?: Record<string, any>
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

/**
 * Flush Sentry events (useful for graceful shutdown)
 * 
 * @param timeout - Timeout in milliseconds
 * @returns Promise that resolves when all events are sent
 */
export async function flushSentry(timeout: number = 2000): Promise<boolean> {
  return await Sentry.close(timeout);
}
