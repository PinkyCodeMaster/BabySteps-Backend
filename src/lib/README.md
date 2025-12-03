# Library Modules

This directory contains core library modules used throughout the application.

## Logger (`logger.ts`)

Structured logging using Pino with environment-specific configuration.

### Features

- **Structured JSON logging** in production for easy parsing
- **Pretty printing** in development for readability
- **Log levels** configurable per environment (trace, debug, info, warn, error, fatal, silent)
- **Automatic redaction** of sensitive fields (passwords, tokens, etc.)
- **Context enrichment** with service name, environment, and timestamps

### Usage

```typescript
import { logger } from './lib/logger';

// Basic logging
logger.info('Server started');
logger.error({ err: error }, 'Failed to process request');

// With context
logger.info({
  userId: '123',
  action: 'login',
  ip: '192.168.1.1'
}, 'User logged in');

// Child logger with persistent context
const requestLogger = logger.child({ requestId: 'req-123' });
requestLogger.info('Processing request');
requestLogger.error({ err: error }, 'Request failed');
```

### Configuration

Set the `LOG_LEVEL` environment variable:
- `trace`: Most verbose, includes all logs
- `debug`: Development debugging (default in development)
- `info`: General information (default in staging)
- `warn`: Warnings only (default in production)
- `error`: Errors only
- `fatal`: Critical errors only
- `silent`: No logs (used in tests)

### Log Format

**Development** (pretty printed):
```
[17:42:53] INFO: Server started
    port: 9000
    env: "development"
```

**Production** (JSON):
```json
{
  "level": 30,
  "time": "2025-12-03T17:42:53.851Z",
  "env": "production",
  "service": "debt-snowball-api",
  "port": 9000,
  "msg": "Server started"
}
```

## Sentry (`sentry.ts`)

Error tracking and monitoring using Sentry.

### Features

- **Automatic error capture** for unhandled exceptions
- **User context tracking** for authenticated requests
- **Breadcrumb tracking** for debugging
- **Sensitive data scrubbing** (passwords, tokens, etc.)
- **Environment-specific configuration**
- **Performance monitoring** (optional)

### Usage

```typescript
import { captureException, captureMessage, setUserContext } from './lib/sentry';

// Capture exceptions
try {
  // ... code that might throw
} catch (error) {
  captureException(error, {
    extra: {
      userId: '123',
      action: 'payment'
    }
  });
}

// Capture messages
captureMessage('Payment processed successfully', 'info', {
  paymentId: 'pay-123',
  amount: 100.00
});

// Set user context (done automatically by auth middleware)
setUserContext({
  id: 'user-123',
  email: 'user@example.com',
  organizationId: 'org-456'
});
```

### Configuration

Set the `SENTRY_DSN` environment variable to enable Sentry:

```env
SENTRY_DSN=https://your-key@sentry.io/project-id
SENTRY_RELEASE=1.0.0  # Optional: track releases
```

### Integration

Sentry is automatically integrated with:
- **Error handler middleware**: Captures 5xx errors
- **Auth middleware**: Sets user context for authenticated requests
- **Server shutdown**: Flushes events before exit

### What Gets Captured

✅ **Captured:**
- Unhandled exceptions
- 5xx server errors
- Database errors
- Unexpected errors

❌ **Not Captured:**
- Validation errors (4xx)
- Authentication errors (401)
- Authorization errors (403)
- Expected business logic errors

### Data Privacy

Sentry automatically scrubs:
- Authorization headers
- Cookies
- Password fields
- Token fields
- Session tokens

## Auth (`auth.ts`)

Better Auth configuration with organization support.

### Features

- Email/password authentication
- Session management with secure cookies
- Organization support (one-family model)
- Postgres adapter via Drizzle ORM
- OpenAPI documentation

See the main README for authentication usage.
