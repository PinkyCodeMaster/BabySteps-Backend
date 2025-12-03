import { Context } from 'hono';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { captureException } from '../lib/sentry';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * Custom application error class with error codes
 */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Error code definitions
 */
export const ErrorCodes = {
  // Authentication (AUTH_xxx)
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',
  AUTH_SESSION_EXPIRED: 'AUTH_002',
  AUTH_SESSION_NOT_FOUND: 'AUTH_003',
  AUTH_EMAIL_ALREADY_REGISTERED: 'AUTH_004',
  
  // Authorization (AUTHZ_xxx)
  AUTHZ_INSUFFICIENT_PERMISSIONS: 'AUTHZ_001',
  AUTHZ_ORGANIZATION_ACCESS_DENIED: 'AUTHZ_002',
  AUTHZ_ADMIN_ROLE_REQUIRED: 'AUTHZ_003',
  
  // Validation (VAL_xxx)
  VAL_INVALID_REQUEST_SCHEMA: 'VAL_001',
  VAL_INVALID_ENUM_VALUE: 'VAL_002',
  VAL_MISSING_REQUIRED_FIELD: 'VAL_003',
  VAL_INVALID_INPUT: 'VAL_004',
  
  // Debt (DEBT_xxx)
  DEBT_CCJ_REQUIRES_DEADLINE: 'DEBT_001',
  DEBT_INVALID_STATUS_TRANSITION: 'DEBT_002',
  DEBT_PAYMENT_EXCEEDS_BALANCE: 'DEBT_003',
  DEBT_CANNOT_MODIFY_PAID: 'DEBT_004',
  
  // Resource (RES_xxx)
  RES_NOT_FOUND: 'RES_001',
  RES_CONFLICT: 'RES_002',
  
  // Rate Limiting (RATE_xxx)
  RATE_LIMIT_EXCEEDED: 'RATE_001',
  
  // Server (SRV_xxx)
  SRV_INTERNAL_ERROR: 'SRV_001',
  SRV_DATABASE_ERROR: 'SRV_002',
} as const;

/**
 * Sanitize error message to avoid leaking sensitive information
 */
function sanitizeErrorMessage(error: Error, isDevelopment: boolean): string {
  if (isDevelopment) {
    return error.message;
  }
  
  // In production, return generic messages for unexpected errors
  if (error instanceof AppError) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
}

/**
 * Format Zod validation errors into readable format
 */
function formatZodError(error: ZodError): Record<string, any> {
  const details: Record<string, string[]> = {};
  
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }
  
  return details;
}

/**
 * Global error handler for Hono's onError hook
 * 
 * 
 * Handles all errors thrown in the application:
 * - Sanitizes error responses to avoid leaking sensitive data
 * - Logs errors with full context
 * - Returns standardized error format with error codes
 */
export const handleError = (error: Error, c: Context) => {
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  
  // Log error with full context using structured logging
  logger.error({
    err: error,
    path: c.req.path,
    method: c.req.method,
    requestId: c.get('requestId'),
    userId: c.get('userId'),
    organizationId: c.get('organizationId'),
    headers: {
      'user-agent': c.req.header('user-agent'),
      'content-type': c.req.header('content-type'),
    },
  }, 'Request error occurred');
  
  // Capture error in Sentry (except for expected validation errors)
  if (!(error instanceof ZodError) && !(error instanceof AppError && error.statusCode < 500)) {
    captureException(error, {
      request: {
        path: c.req.path,
        method: c.req.method,
        requestId: c.get('requestId'),
      },
      user: {
        userId: c.get('userId'),
        organizationId: c.get('organizationId'),
      },
    });
  }
  
  let statusCode = 500;
  let errorCode: string = ErrorCodes.SRV_INTERNAL_ERROR;
  let message = 'An unexpected error occurred';
  let details: Record<string, any> | undefined;
  
  // Handle different error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    errorCode = ErrorCodes.VAL_INVALID_REQUEST_SCHEMA;
    message = 'Request validation failed';
    details = formatZodError(error);
  } else if (error instanceof Error) {
    message = sanitizeErrorMessage(error, isDevelopment);
    
    // Check for common error patterns
    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = ErrorCodes.RES_NOT_FOUND;
    } else if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
      statusCode = 401;
      errorCode = ErrorCodes.AUTH_SESSION_NOT_FOUND;
    } else if (error.message.includes('forbidden') || error.message.includes('permission')) {
      statusCode = 403;
      errorCode = ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS;
    } else if (error.message.includes('conflict') || error.message.includes('duplicate')) {
      statusCode = 409;
      errorCode = ErrorCodes.RES_CONFLICT;
    }
  }
  
  // Build sanitized error response
  const errorResponse: ErrorResponse = {
    error: {
      code: errorCode,
      message,
      ...(details && { details }),
    },
  };
  
  // In development, include stack trace
  if (isDevelopment && error instanceof Error) {
    errorResponse.error.details = {
      ...errorResponse.error.details,
      stack: error.stack,
    };
  }
  
  return c.json(errorResponse, statusCode as any);
};
