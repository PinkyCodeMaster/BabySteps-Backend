# Logging Infrastructure Setup

This document describes the logging infrastructure implemented for the Debt Snowball API.

## Overview

The application now uses structured logging with Pino and optional error tracking with Sentry for comprehensive observability and debugging.

## Components

### 1. Structured Logging (Pino)

**Location:** `src/lib/logger.ts`

**Features:**
- Structured JSON logging in production for easy parsing and analysis
- Pretty-printed logs in development for readability
- Configurable log levels per environment
- Automatic redaction of sensitive data (passwords, tokens, etc.)
- Context enrichment with service name, environment, and timestamps
- Child loggers for request-scoped context

**Configuration:**
- Set `LOG_LEVEL` environment variable (trace, debug, info, warn, error, fatal, silent)
- Defaults: debug (dev), info (staging), warn (prod), silent (test)

**Usage:**
```typescript
import { logger } from './lib/logger';

logger.info('Server started');
logger.error({ err: error }, 'Failed to process request');
logger.warn({ userId, action }, 'Suspicious activity detected');
```

### 2. Error Tracking (Sentry)

**Location:** `src/lib/sentry.ts`

**Features:**
- Automatic error capture for unhandled exceptions
- User context tracking for authenticated requests
- Breadcrumb tracking for debugging
- Sensitive data scrubbing (passwords, tokens, etc.)
- Environment-specific configuration
- Performance monitoring (optional, 10% sampling in production)

**Configuration:**
- Set `SENTRY_DSN` environment variable to enable
- Optional: Set `SENTRY_RELEASE` for release tracking

**Integration Points:**
- Error handler middleware: Captures 5xx errors
- Auth middleware: Sets user context
- Server shutdown: Flushes events before exit

## Updated Files

### Core Library Files
- ✅ `src/lib/logger.ts` - Pino logger configuration
- ✅ `src/lib/sentry.ts` - Sentry error tracking
- ✅ `src/lib/README.md` - Documentation for library modules

### Middleware
- ✅ `src/middleware/errorHandler.middleware.ts` - Integrated structured logging and Sentry
- ✅ `src/middleware/requestLogger.middleware.ts` - Replaced console.log with structured logging
- ✅ `src/middleware/auth.middleware.ts` - Added Sentry user context tracking
- ✅ `src/middleware/cors.middleware.ts` - Replaced console.log with logger

### Services
- ✅ `src/services/audit.service.ts` - Replaced console.error with logger
- ✅ `src/services/cache.service.ts` - Replaced console.log/error with logger
- ✅ `src/services/deletion.service.ts` - Replaced console.log with logger

### Routes
- ✅ `src/routes/health.router.ts` - Replaced console.error with logger

### Core Files
- ✅ `src/server.ts` - Initialize Sentry, replaced console.log with logger
- ✅ `src/db/index.ts` - Replaced console.error with logger
- ✅ `src/lib/auth.ts` - Replaced console.log with logger
- ✅ `src/config/index.ts` - Updated LOG_LEVEL validation

### Configuration
- ✅ `.env.example` - Added logging and Sentry configuration examples
- ✅ `package.json` - Added pino, pino-pretty, @sentry/bun dependencies

## Log Levels

| Level | Description | When to Use |
|-------|-------------|-------------|
| trace | Most verbose | Detailed debugging, rarely used |
| debug | Debug information | Development debugging |
| info | General information | Important events, state changes |
| warn | Warning messages | Potential issues, slow requests |
| error | Error messages | Errors that need attention |
| fatal | Critical errors | System-critical failures |
| silent | No logs | Testing |

## Environment-Specific Behavior

### Development
- Pretty-printed logs with colors
- Log level: debug
- Sentry: disabled (unless SENTRY_DSN set)

### Test
- Silent logs (no output)
- Sentry: always disabled

### Staging
- JSON structured logs
- Log level: info
- Sentry: enabled with full sampling

### Production
- JSON structured logs
- Log level: warn
- Sentry: enabled with 10% performance sampling

## What Gets Logged

### Request Logging
- ✅ Request ID (for tracing)
- ✅ HTTP method and path
- ✅ Response status code
- ✅ Request duration
- ✅ User ID (if authenticated)
- ✅ Organization ID (if authenticated)
- ✅ Slow request warnings (>1s)

### Error Logging
- ✅ Error message and stack trace
- ✅ Request context (path, method, headers)
- ✅ User context (userId, organizationId)
- ✅ Request ID for correlation

### Application Events
- ✅ Server startup/shutdown
- ✅ Database connection status
- ✅ Cache service initialization
- ✅ Configuration validation
- ✅ Audit log failures

## What Gets Tracked in Sentry

### Captured
- ✅ Unhandled exceptions
- ✅ 5xx server errors
- ✅ Database errors
- ✅ Unexpected errors

### Not Captured
- ❌ Validation errors (4xx)
- ❌ Authentication errors (401)
- ❌ Authorization errors (403)
- ❌ Expected business logic errors

## Data Privacy

### Automatically Redacted
- Passwords and password hashes
- Session tokens and auth tokens
- Authorization headers
- Cookies
- Any field named: password, token, secret, authorization, cookie

### User Context
- User ID (anonymized UUID)
- Email (only in development)
- Organization ID (anonymized UUID)

## Testing

All existing tests pass with the new logging infrastructure:
- ✅ Config validation tests
- ✅ Middleware tests
- ✅ Service tests
- ✅ Router integration tests

Logs are silenced during tests (LOG_LEVEL=silent in test environment).

## Monitoring Recommendations

### Production Setup
1. **Log Aggregation**: Send logs to a service like:
   - Datadog
   - New Relic
   - CloudWatch Logs
   - Elasticsearch + Kibana

2. **Sentry Setup**:
   - Create a Sentry project
   - Set SENTRY_DSN in production environment
   - Configure alerts for error rate thresholds
   - Set up release tracking for deployments

3. **Alerts**:
   - Error rate > 5% of requests
   - Fatal errors (immediate notification)
   - Slow requests > 1s (review daily)
   - Database connection failures (immediate)

### Useful Queries

**Find all errors for a user:**
```json
{ "userId": "user-123", "level": 50 }
```

**Find slow requests:**
```json
{ "duration": { "$gt": 1000 } }
```

**Find errors by request ID:**
```json
{ "requestId": "req-abc123" }
```

## Next Steps

1. ✅ Logging infrastructure set up
2. ✅ Sentry integration complete
3. ⏭️ Configure log aggregation service (production)
4. ⏭️ Set up Sentry alerts and notifications
5. ⏭️ Create monitoring dashboards
6. ⏭️ Document runbook for common errors

## Requirements Satisfied

- ✅ **Requirement 10.4**: Error handling with logging and sanitization
- ✅ **Task 30.1**: Install and configure logging library (Pino)
- ✅ **Task 30.2**: Integrate error tracking (Sentry)
