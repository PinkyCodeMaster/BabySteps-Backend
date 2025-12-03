# Environment Configuration Guide

This guide covers setting up staging and production environments for the Debt Snowball API, including database configuration, monitoring, backups, and alerts.

## Table of Contents

1. [Environment Overview](#environment-overview)
2. [Staging Environment Setup](#staging-environment-setup)
3. [Production Environment Setup](#production-environment-setup)
4. [Database Backups](#database-backups)
5. [Monitoring and Alerts](#monitoring-and-alerts)
6. [Security Configuration](#security-configuration)
7. [Performance Optimization](#performance-optimization)

---

## Environment Overview

### Environment Comparison

| Aspect | Development | Staging | Production |
|--------|------------|---------|------------|
| **Purpose** | Local development | Pre-production testing | Live user traffic |
| **Database** | Local PostgreSQL | Neon Staging | Neon Production |
| **Caching** | Optional Redis | Redis (recommended) | Redis (required) |
| **Log Level** | `debug` | `info` | `warn` |
| **Error Tracking** | Optional | Sentry Staging | Sentry Production |
| **Backups** | Manual | Daily | Hourly + Daily |
| **Monitoring** | None | Basic | Full monitoring |
| **SSL/TLS** | Optional | Required | Required |
| **Rate Limiting** | Disabled | Enabled | Enabled (strict) |

### Environment URLs

**Staging**:
- API: `https://api-staging.yourdomain.com`
- Docs: `https://api-staging.yourdomain.com/docs`
- Health: `https://api-staging.yourdomain.com/health`

**Production**:
- API: `https://api.yourdomain.com`
- Docs: `https://api.yourdomain.com/docs`
- Health: `https://api.yourdomain.com/health`

---

## Staging Environment Setup

### 1. Database Configuration (Neon)

#### Create Staging Database

1. **Go to Neon Console**: https://console.neon.tech
2. **Create New Project**:
   - Name: `debt-snowball-staging`
   - Region: Choose closest to your users (e.g., `aws-eu-west-2` for UK)
   - PostgreSQL version: 16

3. **Configure Connection Pooling**:
   - Enable connection pooling (PgBouncer)
   - Pool mode: Transaction
   - Max connections: 100

4. **Get Connection String**:
   ```
   postgresql://user:password@staging-db.neon.tech/debt_snowball_staging?sslmode=require
   ```

#### Configure Database Settings

```sql
-- Connect to staging database
psql "postgresql://user:password@staging-db.neon.tech/debt_snowball_staging?sslmode=require"

-- Set timezone
ALTER DATABASE debt_snowball_staging SET timezone TO 'UTC';

-- Set connection limits
ALTER DATABASE debt_snowball_staging CONNECTION LIMIT 100;

-- Enable extensions (if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
```

### 2. Redis Configuration (Upstash)

#### Create Staging Redis

1. **Go to Upstash Console**: https://console.upstash.com
2. **Create Database**:
   - Name: `debt-snowball-staging`
   - Region: Same as your API deployment
   - Type: Regional (for staging)

3. **Get Connection String**:
   ```
   redis://default:password@staging-redis.upstash.io:6379
   ```

4. **Configure Redis**:
   - Max memory: 256 MB (staging)
   - Eviction policy: `allkeys-lru`
   - TLS: Enabled

### 3. Environment Variables (Staging)

Create `.env.staging` file (DO NOT commit to git):

```bash
# Database
DATABASE_URL=postgresql://user:password@staging-db.neon.tech/debt_snowball_staging?sslmode=require

# Authentication
BETTER_AUTH_SECRET=<generate-with-openssl-rand-base64-48>
BETTER_AUTH_URL=https://api-staging.yourdomain.com

# CORS
ALLOWED_ORIGINS=https://staging.yourdomain.com,https://app-staging.yourdomain.com

# Server
PORT=9000
NODE_ENV=production

# Logging
LOG_LEVEL=info

# Error Tracking
SENTRY_DSN=https://abc123@o123456.ingest.sentry.io/staging-project-id
SENTRY_ENVIRONMENT=staging
SENTRY_TRACES_SAMPLE_RATE=0.5

# Caching
REDIS_URL=redis://default:password@staging-redis.upstash.io:6379

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW=900000
RATE_LIMIT_API_MAX=100
RATE_LIMIT_API_WINDOW=60000

# Feature Flags (optional)
ENABLE_BABY_STEPS=true
ENABLE_UC_CALCULATIONS=true
ENABLE_EXPORT=true
```

#### Generate Secrets

```bash
# Generate BETTER_AUTH_SECRET (minimum 32 characters)
openssl rand -base64 48

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Or use Bun
bun -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### 4. Deploy to Staging

#### Railway Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create staging environment
railway environment create staging

# Switch to staging
railway environment staging

# Link to project
railway link

# Set environment variables
railway variables set DATABASE_URL="postgresql://..."
railway variables set BETTER_AUTH_SECRET="..."
railway variables set BETTER_AUTH_URL="https://api-staging.yourdomain.com"
railway variables set ALLOWED_ORIGINS="https://staging.yourdomain.com"
railway variables set NODE_ENV="production"
railway variables set LOG_LEVEL="info"
railway variables set SENTRY_DSN="https://..."
railway variables set REDIS_URL="redis://..."

# Deploy
railway up
```

#### Render Deployment

1. Connect GitHub repository in Render dashboard
2. Create new Web Service
3. Select `staging` branch
4. Set environment variables in dashboard
5. Deploy automatically

### 5. Verify Staging Deployment

```bash
# Health check
curl https://api-staging.yourdomain.com/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected",
  "version": "1.0.0"
}

# Test API docs
curl https://api-staging.yourdomain.com/docs

# Test authentication
curl -X POST https://api-staging.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

---

## Production Environment Setup

### 1. Database Configuration (Neon)

#### Create Production Database

1. **Go to Neon Console**: https://console.neon.tech
2. **Create New Project**:
   - Name: `debt-snowball-production`
   - Region: Choose closest to your users
   - PostgreSQL version: 16
   - Plan: **Pro** (for production features)

3. **Configure Connection Pooling**:
   - Enable connection pooling (PgBouncer)
   - Pool mode: Transaction
   - Max connections: 500

4. **Enable Autoscaling** (Neon Pro):
   - Min compute: 0.25 vCPU
   - Max compute: 2 vCPU
   - Auto-suspend: 5 minutes

5. **Get Connection String**:
   ```
   postgresql://user:password@prod-db.neon.tech/debt_snowball_production?sslmode=require
   ```

#### Configure Database Settings

```sql
-- Connect to production database
psql "postgresql://user:password@prod-db.neon.tech/debt_snowball_production?sslmode=require"

-- Set timezone
ALTER DATABASE debt_snowball_production SET timezone TO 'UTC';

-- Set connection limits
ALTER DATABASE debt_snowball_production CONNECTION LIMIT 500;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Configure query performance tracking
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';
```

#### Configure Database Indexes

```sql
-- Ensure all critical indexes exist
-- (These should be created by migrations, but verify)

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON organizations(created_at);

-- Memberships
CREATE INDEX IF NOT EXISTS idx_memberships_org_id ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_email ON memberships(invited_email);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);

-- Incomes
CREATE INDEX IF NOT EXISTS idx_incomes_org_id ON incomes(organization_id);
CREATE INDEX IF NOT EXISTS idx_incomes_created_at ON incomes(created_at);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_org_id ON expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_priority ON expenses(priority);

-- Debts
CREATE INDEX IF NOT EXISTS idx_debts_org_id ON debts(organization_id);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
CREATE INDEX IF NOT EXISTS idx_debts_ccj ON debts(is_ccj);
CREATE INDEX IF NOT EXISTS idx_debts_snowball_pos ON debts(snowball_position);

-- Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Baby Steps
CREATE UNIQUE INDEX IF NOT EXISTS idx_baby_steps_org_id ON baby_steps(organization_id);
```

### 2. Redis Configuration (Upstash)

#### Create Production Redis

1. **Go to Upstash Console**: https://console.upstash.com
2. **Create Database**:
   - Name: `debt-snowball-production`
   - Region: Same as your API deployment
   - Type: **Global** (for production)

3. **Get Connection String**:
   ```
   redis://default:password@prod-redis.upstash.io:6379
   ```

4. **Configure Redis**:
   - Max memory: 1 GB (production)
   - Eviction policy: `allkeys-lru`
   - TLS: Enabled
   - Persistence: Enabled

### 3. Environment Variables (Production)

Create `.env.production` file (DO NOT commit to git):

```bash
# Database
DATABASE_URL=postgresql://user:password@prod-db.neon.tech/debt_snowball_production?sslmode=require

# Authentication (DIFFERENT secret from staging!)
BETTER_AUTH_SECRET=<different-secret-from-staging>
BETTER_AUTH_URL=https://api.yourdomain.com

# CORS (production domains only)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com

# Server
PORT=9000
NODE_ENV=production

# Logging (less verbose in production)
LOG_LEVEL=warn

# Error Tracking (production project)
SENTRY_DSN=https://xyz789@o123456.ingest.sentry.io/prod-project-id
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Caching (required in production)
REDIS_URL=redis://default:password@prod-redis.upstash.io:6379

# Rate Limiting (stricter in production)
RATE_LIMIT_ENABLED=true
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW=900000
RATE_LIMIT_API_MAX=100
RATE_LIMIT_API_WINDOW=60000
RATE_LIMIT_CALCULATION_MAX=30
RATE_LIMIT_CALCULATION_WINDOW=60000

# Feature Flags
ENABLE_BABY_STEPS=true
ENABLE_UC_CALCULATIONS=true
ENABLE_EXPORT=true

# Performance
MAX_REQUEST_SIZE=10mb
REQUEST_TIMEOUT=30000
```

### 4. Deploy to Production

#### Pre-Deployment Checklist

- [ ] All tests passing in staging
- [ ] Database migrations tested in staging
- [ ] Environment variables documented
- [ ] Secrets generated and stored securely
- [ ] Monitoring configured
- [ ] Alerts configured
- [ ] Backup strategy in place
- [ ] Rollback plan documented
- [ ] Team notified of deployment

#### Railway Deployment

```bash
# Switch to production environment
railway environment production

# Set environment variables
railway variables set DATABASE_URL="postgresql://..."
railway variables set BETTER_AUTH_SECRET="<different-from-staging>"
railway variables set BETTER_AUTH_URL="https://api.yourdomain.com"
railway variables set ALLOWED_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
railway variables set NODE_ENV="production"
railway variables set LOG_LEVEL="warn"
railway variables set SENTRY_DSN="https://..."
railway variables set REDIS_URL="redis://..."

# Deploy
railway up

# Or push to main branch (auto-deploys)
git push origin main
```

### 5. Verify Production Deployment

```bash
# Health check
curl https://api.yourdomain.com/health

# Test API docs
curl https://api.yourdomain.com/docs

# Run smoke tests
./scripts/smoke-tests.sh production
```

---

## Database Backups

### Neon Automatic Backups

Neon provides automatic backups for Pro plans:

**Staging**:
- Frequency: Daily
- Retention: 7 days
- Point-in-time recovery: 7 days

**Production**:
- Frequency: Hourly
- Retention: 30 days
- Point-in-time recovery: 30 days

### Manual Backup Script

Create `scripts/backup-database.sh`:

```bash
#!/bin/bash

# Database backup script
# Usage: ./scripts/backup-database.sh [staging|production]

ENVIRONMENT=${1:-staging}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"

# Create backup directory
mkdir -p $BACKUP_DIR

# Set database URL based on environment
if [ "$ENVIRONMENT" = "production" ]; then
    DB_URL=$PRODUCTION_DATABASE_URL
    BACKUP_FILE="$BACKUP_DIR/prod_backup_$TIMESTAMP.sql"
else
    DB_URL=$STAGING_DATABASE_URL
    BACKUP_FILE="$BACKUP_DIR/staging_backup_$TIMESTAMP.sql"
fi

echo "Creating backup for $ENVIRONMENT environment..."

# Create backup
pg_dump "$DB_URL" > "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"

echo "Backup created: ${BACKUP_FILE}.gz"

# Upload to S3 (optional)
# aws s3 cp "${BACKUP_FILE}.gz" s3://your-backup-bucket/

# Clean up old backups (keep last 30 days)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup complete!"
```

### Restore from Backup

```bash
# Download backup (if stored remotely)
# aws s3 cp s3://your-backup-bucket/backup.sql.gz ./

# Decompress
gunzip backup.sql.gz

# Restore to database
psql "$DATABASE_URL" < backup.sql

# Verify restoration
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM organizations;"
```

### Backup Testing

Test backup restoration monthly:

```bash
# 1. Create test database
createdb debt_snowball_test_restore

# 2. Restore backup
psql "postgresql://localhost/debt_snowball_test_restore" < backup.sql

# 3. Verify data integrity
psql "postgresql://localhost/debt_snowball_test_restore" -c "
  SELECT 
    (SELECT COUNT(*) FROM organizations) as orgs,
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM debts) as debts;
"

# 4. Clean up
dropdb debt_snowball_test_restore
```

---

## Monitoring and Alerts

### 1. Application Monitoring (Sentry)

#### Configure Sentry

**Staging Project**:
```bash
# Create staging project in Sentry
# Get DSN from project settings
SENTRY_DSN=https://abc123@o123456.ingest.sentry.io/staging-id
```

**Production Project**:
```bash
# Create production project in Sentry
# Get DSN from project settings
SENTRY_DSN=https://xyz789@o123456.ingest.sentry.io/prod-id
```

#### Configure Alerts

1. **Error Rate Alert**:
   - Condition: Error rate > 5% over 5 minutes
   - Action: Send to Slack + Email
   - Severity: High

2. **Critical Error Alert**:
   - Condition: Any 500 error
   - Action: Send to Slack immediately
   - Severity: Critical

3. **Performance Alert**:
   - Condition: P95 response time > 2 seconds
   - Action: Send to Slack
   - Severity: Medium

### 2. Uptime Monitoring (UptimeRobot)

#### Configure Monitors

**Staging**:
```
Name: Debt Snowball API - Staging
URL: https://api-staging.yourdomain.com/health
Type: HTTP(s)
Interval: 5 minutes
Alert on: 2 consecutive failures
Notification: Email
```

**Production**:
```
Name: Debt Snowball API - Production
URL: https://api.yourdomain.com/health
Type: HTTP(s)
Interval: 1 minute
Alert on: 2 consecutive failures
Notification: Email + SMS + Slack
```

### 3. Database Monitoring (Neon)

#### Configure Alerts

1. **Connection Limit Alert**:
   - Condition: Connections > 80% of limit
   - Action: Email notification

2. **Storage Alert**:
   - Condition: Storage > 80% of limit
   - Action: Email notification

3. **Query Performance Alert**:
   - Condition: Slow queries > 1 second
   - Action: Log for review

### 4. Redis Monitoring (Upstash)

#### Configure Alerts

1. **Memory Usage Alert**:
   - Condition: Memory > 80%
   - Action: Email notification

2. **Connection Alert**:
   - Condition: Connection failures
   - Action: Email notification

### 5. Slack Integration

#### Create Slack Webhook

1. Go to Slack workspace → Apps → Incoming Webhooks
2. Click "Add to Slack"
3. Choose channel: `#deployments` or `#alerts`
4. Copy webhook URL

#### Configure Notifications

**Deployment Notifications**:
- Channel: `#deployments`
- Events: Deploy success, deploy failure

**Error Notifications**:
- Channel: `#alerts`
- Events: Critical errors, high error rate

**Uptime Notifications**:
- Channel: `#alerts`
- Events: Service down, service recovered

---

## Security Configuration

### 1. SSL/TLS Configuration

**Railway**: Automatic SSL with Let's Encrypt
**Render**: Automatic SSL with Let's Encrypt
**Fly.io**: Automatic SSL with Let's Encrypt

**Custom Domain**:
```bash
# Railway
railway domain add api.yourdomain.com

# Fly.io
fly certs add api.yourdomain.com
```

### 2. CORS Configuration

**Staging**:
```bash
ALLOWED_ORIGINS=https://staging.yourdomain.com,https://app-staging.yourdomain.com
```

**Production**:
```bash
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com
```

### 3. Rate Limiting

**Configuration** (in environment variables):

```bash
# Authentication endpoints
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW=900000  # 15 minutes

# General API endpoints
RATE_LIMIT_API_MAX=100
RATE_LIMIT_API_WINDOW=60000  # 1 minute

# Calculation endpoints
RATE_LIMIT_CALCULATION_MAX=30
RATE_LIMIT_CALCULATION_WINDOW=60000  # 1 minute
```

### 4. Secret Rotation

**Schedule**:
- `BETTER_AUTH_SECRET`: Rotate every 90 days
- Database passwords: Rotate every 90 days
- API tokens: Rotate every 90 days

**Rotation Process**:

1. Generate new secret
2. Update in deployment platform
3. Deploy with new secret
4. Verify application works
5. Document rotation in changelog

### 5. Security Headers

Configured in middleware:

```typescript
// Security headers
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  await next();
});
```

---

## Performance Optimization

### 1. Database Optimization

**Connection Pooling**:
- Use Neon's connection pooling (PgBouncer)
- Pool mode: Transaction
- Max connections: 500 (production), 100 (staging)

**Query Optimization**:
```sql
-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM debts WHERE organization_id = '...';

-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Vacuum and analyze
VACUUM ANALYZE;
```

### 2. Caching Strategy

**Cache Configuration**:

```typescript
// Cache TTLs
const CACHE_TTL = {
  snowball: 300,        // 5 minutes
  debtFreeDate: 300,    // 5 minutes
  disposableIncome: 300, // 5 minutes
  babySteps: 3600,      // 1 hour
  ucConfig: 86400,      // 24 hours
};
```

**Cache Invalidation**:
- Invalidate on data changes
- Use cache keys with organization ID
- Implement cache warming for common queries

### 3. API Response Optimization

**Pagination**:
```typescript
// Default pagination
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
```

**Response Compression**:
```typescript
// Enable gzip compression
app.use(compress());
```

### 4. Resource Allocation

**Staging**:
- CPU: 0.5 vCPU
- Memory: 512 MB
- Database: Shared compute

**Production**:
- CPU: 1-2 vCPU (autoscaling)
- Memory: 1-2 GB
- Database: Dedicated compute with autoscaling

---

## Maintenance Windows

### Scheduled Maintenance

**Staging**:
- Window: Weekdays 2-4 AM UTC
- Frequency: As needed
- Notification: Not required

**Production**:
- Window: Sundays 2-4 AM UTC
- Frequency: Monthly (if needed)
- Notification: 48 hours advance notice

### Maintenance Checklist

- [ ] Notify users of maintenance window
- [ ] Create database backup
- [ ] Test changes in staging
- [ ] Apply changes during maintenance window
- [ ] Verify application health
- [ ] Monitor for errors
- [ ] Notify users of completion

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Errors

**Symptoms**: "Connection refused", "Too many connections"

**Solutions**:
```bash
# Check connection count
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
psql "$DATABASE_URL" -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '5 minutes';
"

# Increase connection limit (if needed)
# Contact Neon support or upgrade plan
```

#### 2. High Memory Usage

**Symptoms**: Application crashes, OOM errors

**Solutions**:
- Increase memory allocation
- Enable Redis caching
- Optimize database queries
- Review memory leaks in code

#### 3. Slow Response Times

**Symptoms**: API requests taking > 2 seconds

**Solutions**:
- Enable Redis caching
- Add database indexes
- Optimize N+1 queries
- Use database connection pooling

---

## Additional Resources

- [Neon Documentation](https://neon.tech/docs)
- [Upstash Documentation](https://docs.upstash.com/)
- [Railway Documentation](https://docs.railway.app/)
- [Sentry Documentation](https://docs.sentry.io/)
- [UptimeRobot Documentation](https://uptimerobot.com/api/)

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
