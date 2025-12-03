# Environment Configuration

This module provides environment variable validation and configuration management for the Debt Snowball API.

## Features

- **Fail-fast validation**: Validates all required environment variables on startup
- **Type safety**: Provides TypeScript types for all configuration values
- **Clear error messages**: Shows detailed validation errors with helpful messages
- **Default values**: Applies sensible defaults for optional configuration
- **Helper functions**: Provides utility functions for environment checks

## Usage

### Server Startup

The configuration is automatically validated when the server starts:

```typescript
import { validateEnv, getConfig } from './config';

// Validate environment on startup (fails fast if invalid)
validateEnv();

// Get validated configuration
const config = getConfig();
console.log(`Server running on port ${config.PORT}`);
```

### Accessing Configuration

After validation, use `getConfig()` to access configuration values:

```typescript
import { getConfig } from './config';

const config = getConfig();

// Access configuration values with full type safety
const dbUrl = config.DATABASE_URL;
const port = config.PORT; // number type
const nodeEnv = config.NODE_ENV; // 'development' | 'production' | 'test'
```

### Environment Helpers

Use helper functions to check the current environment:

```typescript
import { isProduction, isDevelopment, isTest } from './config';

if (isProduction()) {
  // Production-specific logic
}

if (isDevelopment()) {
  // Development-specific logic
}

if (isTest()) {
  // Test-specific logic
}
```

## Required Environment Variables

The following environment variables are **required** and must be set:

- `DATABASE_URL`: PostgreSQL connection URL (must be a valid URL)
- `BETTER_AUTH_SECRET`: Secret key for Better Auth (minimum 32 characters)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

## Optional Environment Variables

The following environment variables have default values:

- `BETTER_AUTH_URL`: Auth service URL (default: `http://localhost:9000`)
- `PORT`: Server port (default: `9000`)
- `NODE_ENV`: Environment mode (default: `development`)
  - Allowed values: `development`, `production`, `test`
- `LOG_LEVEL`: Logging level (default: `info`)
  - Allowed values: `debug`, `info`, `warn`, `error`
- `SENTRY_DSN`: Sentry error tracking URL (optional)
- `REDIS_URL`: Redis connection URL (optional)

## Validation Rules

### DATABASE_URL
- Must be a valid URL format
- Example: `postgresql://user:password@localhost:5432/database`

### BETTER_AUTH_SECRET
- Must be at least 32 characters long for security
- Should be a random, cryptographically secure string
- Example: Generate with `openssl rand -base64 32`

### ALLOWED_ORIGINS
- Must be a non-empty string
- Multiple origins separated by commas
- Example: `http://localhost:3000,http://localhost:5173`

### PORT
- Must be a valid number
- Will be converted to a number type
- Example: `9000`

### NODE_ENV
- Must be one of: `development`, `production`, `test`
- Affects security settings (e.g., secure cookies in production)

### LOG_LEVEL
- Must be one of: `debug`, `info`, `warn`, `error`
- Controls logging verbosity

## Error Handling

If validation fails, the application will:

1. Print detailed error messages to the console
2. Show which variables are missing or invalid
3. Exit with code 1 (fail fast)

Example error output:

```
❌ Environment configuration validation failed:

   - DATABASE_URL: DATABASE_URL is required
   - BETTER_AUTH_SECRET: BETTER_AUTH_SECRET must be at least 32 characters for security

Please check your .env file and ensure all required variables are set correctly.
See .env.example for reference.
```

## Example .env File

See `.env.example` in the project root for a complete example of all environment variables.

## Testing

The configuration module includes comprehensive tests that validate:

- Required variables are present
- URL formats are valid
- String lengths meet requirements
- Enum values are within allowed sets
- Helper functions work correctly

Run tests with:

```bash
bun test src/__tests__/config/index.test.ts
```
