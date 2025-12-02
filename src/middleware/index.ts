/**
 * Middleware exports
 * 
 * Core middleware for the Debt Snowball API:
 * - Auth: Authentication and session validation
 * - Auth Guards: Authorization guards for role-based access control
 * - CORS: Cross-origin resource sharing with strict origin checking
 * - Error Handler: Global error handling with sanitization and logging
 * - Rate Limiting: Request rate limiting for different endpoint types
 * - Request Logger: Request/response logging with timing and context
 */

export {
  authMiddleware,
  getAuthContext,
  hasOrganizationContext,
  type AuthContext,
} from './auth.middleware';
export {
  requireAuth,
  requireOrganization,
  requireAdmin,
  requireMember,
  requireRole,
  verifyOrganizationAccess,
  requireOrgAccess,
  requireOrgAdmin,
  requireOrgMember,
} from './authGuards.middleware';
export { corsMiddleware } from './cors.middleware';
export {
  handleError,
  AppError,
  ErrorCodes,
  type ErrorResponse,
} from './errorHandler.middleware';
export {
  rateLimit,
  authRateLimit,
  paymentRateLimit,
  calculationRateLimit,
  generalRateLimit,
  type RateLimitConfig,
} from './rateLimit.middleware';
export { requestLogger } from './requestLogger.middleware';
