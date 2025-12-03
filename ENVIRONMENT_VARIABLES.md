# Environment Variables Documentation

This document lists all environment variables used by the Debt Snowball API, their purposes, default values, and environment-specific configurations.

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update the values in `.env` according to your environment (development, staging, or production)

3. The application validates all required environment variables on startup and will fail fast with detailed error messages if any are missing or invalid.

## Required Variables

These variables **must** be set for the application to start:

### `DATABASE_URL`

**Purpose**: PostgreSQL database connection string

**Format**: `postgresql://user:password@host:port/database`

**Example**:
```
DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/debt_snowball_dev
```

**Environment-specific values**:
- **Development**: Local PostgreSQL instance or Neon development database
- **Staging**: Neon staging database with connection pooling enabled
- **Production**: Neon production database with connection pooling enabled

**Notes**:
- For Neon databases, use the connection string with pooling enabled (ends with `?sslmode=require`)
- Ensure the database user has sufficient permissions for schema migrations
- Keep credentials secure and never commit them to version control

---

### `BETTER_AUTH_SECRET`

**Purpose**: Secret key used for signing session tokens and encrypting sensitive data

**Format**: String of at least 32 characters

**Example**:
```
BETTER_AUTH_SECRET=your-very-long-random-secret-key-at-least-32-characters
```

**Environment-specific values**:
- **Development**: Any string ≥32 characters (can be simple for local dev)
- **Staging**: Cryptographically random string ≥32 characters
- **Production**: Cryptographically random string ≥32 characters (different from staging)

**Security Requirements**:
- **MUST** be at least 32 characters long
- **MUST** be different between staging and production
- **MUST** be cryptographically random in production
- **MUST** be kept secret and never exposed in logs or error messages

**Generate a secure secret**:
```bash
# Using openssl
openssl rand -base64 48

# Using Node.js
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

---

### `BETTER_AUTH_URL`

**Purpose**: Base URL where the API is accessible (used for authentication callbacks and CORS)

**Format**: Valid HTTP/HTTPS URL

**Default**: `http://localhost:9000`

**Example**:
```
BETTER_AUTH_URL=http://localhost:9000
```

**Environment-specific values**:
- **Development**: `http://localhost:9000` (or your local port)
- **Staging**: `https://api-staging.yourdomain.com`
- **Production**: `https://api.yourdomain.com`

**Notes**:
- Must match the actual URL where the API is deployed
- Use HTTPS in staging and production
- No trailing slash

---

### `ALLOWED_ORIGINS`

**Purpose**: Comma-separated list of allowed origins for CORS (Cross-Origin Resource Sharing)

**Format**: Comma-separated list of valid HTTP/HTTPS URLs

**Example**:
```
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:9000
```

**Environment-specific values**:
- **Development**: 
  ```
  ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:9000
  ```
  (Include all local development ports for frontend and API)

- **Staging**: 
  ```
  ALLOWED_ORIGINS=https://staging.yourdomain.com,https://api-staging.yourdomain.com
  ```

- **Production**: 
  ```
  ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
  ```

**Security Notes**:
- Only include trusted domains
- Do NOT use wildcards (`*`) in production
- Each origin must be a complete URL with protocol
- No trailing slashes on origins

---

## Optional Variables

These variables are optional and have sensible defaults:

### `PORT`

**Purpose**: Port number the server listens on

**Format**: Numeric string

**Default**: `9000`

**Example**:
```
PORT=9000
```

**Environment-specific values**:
- **Development**: `9000` (or any available port)
- **Staging**: Usually set by hosting platform (e.g., Railway, Render)
- **Production**: Usually set by hosting platform

**Notes**:
- Most cloud platforms (Railway, Render, Fly.io) automatically set this
- If not set, defaults to 9000

---

### `NODE_ENV`

**Purpose**: Specifies the runtime environment

**Format**: One of: `development`, `production`, `test`

**Default**: `development`

**Example**:
```
NODE_ENV=production
```

**Environment-specific values**:
- **Development**: `development`
- **Staging**: `production` (staging uses production mode with different data)
- **Production**: `production`
- **Testing**: `test` (automatically set by test runner)

**Effects**:
- Controls logging verbosity
- Enables/disables certain security features
- Affects error message detail level
- Influences caching behavior

---

### `LOG_LEVEL`

**Purpose**: Controls logging verbosity

**Format**: One of: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`

**Default**: 
- `debug` in development
- `info` in staging
- `warn` in production
- `silent` in test

**Example**:
```
LOG_LEVEL=info
```

**Environment-specific values**:
- **Development**: `debug` (verbose logging for debugging)
- **Staging**: `info` (moderate logging for monitoring)
- **Production**: `warn` (only warnings and errors to reduce noise)
- **Testing**: `silent` (no logs during tests)

**Log Levels Explained**:
- `trace`: Most verbose, includes all details
- `debug`: Detailed debugging information
- `info`: General informational messages
- `warn`: Warning messages (potential issues)
- `error`: Error messages (actual problems)
- `fatal`: Fatal errors (application crashes)
- `silent`: No logging output

---

### `SENTRY_DSN`

**Purpose**: Sentry Data Source Name for error tracking and monitoring

**Format**: Valid Sentry DSN URL

**Default**: Not set (Sentry disabled)

**Example**:
```
SENTRY_DSN=https://abc123def456@o123456.ingest.sentry.io/7890123
```

**Environment-specific values**:
- **Development**: Not set (or set to test Sentry integration)
- **Staging**: Staging project DSN from Sentry
- **Production**: Production project DSN from Sentry

**Setup Instructions**:
1. Create a Sentry account at https://sentry.io
2. Create a new project for your API
3. Copy the DSN from Settings → Projects → [Your Project] → Client Keys (DSN)
4. Set the `SENTRY_DSN` environment variable

**Notes**:
- When not set, Sentry is disabled and errors are only logged locally
- Recommended for staging and production environments
- Helps track errors, performance issues, and user impact

---

### `REDIS_URL`

**Purpose**: Redis connection URL for caching and background jobs

**Format**: Valid Redis URL

**Default**: Not set (caching disabled)

**Example**:
```
REDIS_URL=redis://localhost:6379
```

**Environment-specific values**:
- **Development**: `redis://localhost:6379` (local Redis instance)
- **Staging**: Redis cloud instance URL (e.g., Upstash, Redis Cloud)
- **Production**: Redis cloud instance URL with authentication

**With Authentication**:
```
REDIS_URL=redis://username:password@host:port/db
```

**Setup Instructions**:
1. Install Redis locally for development:
   ```bash
   # macOS
   brew install redis
   brew services start redis
   
   # Ubuntu/Debian
   sudo apt-get install redis-server
   sudo systemctl start redis
   ```

2. For staging/production, use a managed Redis service:
   - [Upstash](https://upstash.com/) (serverless Redis)
   - [Redis Cloud](https://redis.com/cloud/)
   - [Railway](https://railway.app/) (includes Redis)

**Notes**:
- When not set, caching is disabled (application still works)
- Caching improves performance for expensive calculations (snowball, debt-free date)
- Cache TTL is 5 minutes for financial calculations
- Cache is automatically invalidated when financial data changes

---

## Environment-Specific Configuration Summary

### Development Environment

```bash
# .env (development)
DATABASE_URL=postgresql://user:password@localhost:5432/debt_snowball_dev
BETTER_AUTH_SECRET=dev-secret-at-least-32-characters-long
BETTER_AUTH_URL=http://localhost:9000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:9000
PORT=9000
NODE_ENV=development
LOG_LEVEL=debug
# SENTRY_DSN not set (optional for dev)
# REDIS_URL=redis://localhost:6379 (optional)
```

**Characteristics**:
- Local database
- Simple auth secret (still ≥32 chars)
- Multiple localhost origins for frontend dev
- Verbose logging
- Optional Sentry and Redis

---

### Staging Environment

```bash
# .env (staging)
DATABASE_URL=postgresql://user:password@staging-db.neon.tech/debt_snowball_staging?sslmode=require
BETTER_AUTH_SECRET=<cryptographically-random-secret-48-chars>
BETTER_AUTH_URL=https://api-staging.yourdomain.com
ALLOWED_ORIGINS=https://staging.yourdomain.com,https://api-staging.yourdomain.com
PORT=9000
NODE_ENV=production
LOG_LEVEL=info
SENTRY_DSN=https://abc123@o123456.ingest.sentry.io/7890123
REDIS_URL=redis://username:password@staging-redis.upstash.io:6379
```

**Characteristics**:
- Neon staging database with SSL
- Strong random auth secret (different from production)
- HTTPS URLs only
- Production mode with info-level logging
- Sentry enabled for error tracking
- Redis enabled for caching

---

### Production Environment

```bash
# .env (production)
DATABASE_URL=postgresql://user:password@prod-db.neon.tech/debt_snowball_prod?sslmode=require
BETTER_AUTH_SECRET=<different-cryptographically-random-secret-48-chars>
BETTER_AUTH_URL=https://api.yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
PORT=9000
NODE_ENV=production
LOG_LEVEL=warn
SENTRY_DSN=https://xyz789@o123456.ingest.sentry.io/7890124
REDIS_URL=redis://username:password@prod-redis.upstash.io:6379
```

**Characteristics**:
- Neon production database with SSL
- Strong random auth secret (different from staging)
- HTTPS URLs only (production domains)
- Production mode with warn-level logging (less verbose)
- Sentry enabled for error tracking
- Redis enabled for caching

---

## Validation

The application validates all environment variables on startup using Zod schemas. If validation fails, the application will:

1. Print detailed error messages showing which variables are invalid
2. Exit with error code 1
3. Not start the server

**Example validation error**:
```
❌ Environment configuration validation failed:

   - DATABASE_URL: DATABASE_URL is required
   - BETTER_AUTH_SECRET: BETTER_AUTH_SECRET must be at least 32 characters for security
   - ALLOWED_ORIGINS: ALLOWED_ORIGINS is required (comma-separated list)

Please check your .env file and ensure all required variables are set correctly.
See .env.example for reference.
```

---

## Security Best Practices

1. **Never commit `.env` files to version control**
   - `.env` is in `.gitignore`
   - Use `.env.example` as a template

2. **Use different secrets for each environment**
   - Development, staging, and production should have different `BETTER_AUTH_SECRET` values
   - Rotate secrets periodically in production

3. **Use strong, random secrets in production**
   - Generate with `openssl rand -base64 48` or similar
   - Minimum 32 characters, recommend 48+

4. **Restrict CORS origins**
   - Only include trusted domains in `ALLOWED_ORIGINS`
   - Never use wildcards in production

5. **Use HTTPS in staging and production**
   - All URLs should use `https://` protocol
   - Enable SSL/TLS on your database connections

6. **Protect database credentials**
   - Use connection pooling for better performance
   - Limit database user permissions to only what's needed
   - Use read-only replicas for reporting if available

7. **Enable Sentry in production**
   - Helps catch and diagnose errors quickly
   - Set up alerts for critical errors

8. **Use managed services for production**
   - Neon for PostgreSQL (automatic backups, scaling)
   - Upstash or Redis Cloud for Redis (managed, secure)
   - Railway, Render, or Fly.io for hosting

---

## Troubleshooting

### Application won't start

**Check**:
1. All required variables are set in `.env`
2. `DATABASE_URL` is valid and database is accessible
3. `BETTER_AUTH_SECRET` is at least 32 characters
4. `ALLOWED_ORIGINS` is a comma-separated list with no spaces

### CORS errors in browser

**Check**:
1. Frontend URL is included in `ALLOWED_ORIGINS`
2. No trailing slashes on origins
3. Protocol (http/https) matches exactly

### Database connection errors

**Check**:
1. Database is running and accessible
2. Connection string format is correct
3. User has necessary permissions
4. For Neon: SSL mode is enabled (`?sslmode=require`)

### Redis connection errors

**Check**:
1. Redis is running (if local)
2. `REDIS_URL` format is correct
3. Authentication credentials are valid
4. Network allows connection to Redis host

---

## Additional Resources

- [Neon Documentation](https://neon.tech/docs)
- [Better Auth Documentation](https://better-auth.com/docs)
- [Sentry Documentation](https://docs.sentry.io/)
- [Redis Documentation](https://redis.io/docs/)
- [Bun Documentation](https://bun.sh/docs)
