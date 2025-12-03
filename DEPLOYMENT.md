# Deployment Guide

This guide covers deploying the Debt Snowball API to staging and production environments, including database migrations, environment setup, and deployment steps.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Migration Process](#database-migration-process)
3. [Deployment Platforms](#deployment-platforms)
4. [Staging Deployment](#staging-deployment)
5. [Production Deployment](#production-deployment)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Rollback Procedures](#rollback-procedures)
8. [Monitoring and Maintenance](#monitoring-and-maintenance)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

- [ ] Bun v1.0.0 or higher installed locally
- [ ] Access to Neon database (staging and production)
- [ ] Access to deployment platform (Railway, Render, Fly.io, etc.)
- [ ] Sentry account for error tracking (recommended)
- [ ] Redis instance for caching (optional but recommended)
- [ ] All environment variables documented and ready
- [ ] Git repository with latest code
- [ ] All tests passing locally

---

## Database Migration Process

The Debt Snowball API uses Drizzle ORM for database schema management and migrations.

### Understanding Drizzle Migrations

Drizzle provides two approaches for schema changes:

1. **`db:push`** - Direct schema push (development only)
   - Pushes schema changes directly to database
   - No migration files generated
   - Fast for rapid development
   - **Never use in production**

2. **`db:generate` + `db:migrate`** - Migration-based (staging/production)
   - Generates SQL migration files
   - Version-controlled migrations
   - Safe for production
   - Allows review before applying

### Migration Workflow

#### 1. Making Schema Changes

Edit schema files in `src/db/schema/`:

```typescript
// Example: Adding a new field to debts table
export const debts = pgTable('debts', {
  // ... existing fields
  notes: text('notes'), // New field
});
```

#### 2. Generate Migration (Staging/Production)

```bash
bun run db:generate
```

This creates a new migration file in `drizzle/` directory:

```
drizzle/
├── 0000_initial_schema.sql
├── 0001_add_notes_to_debts.sql  # New migration
└── meta/
    ├── _journal.json
    └── 0001_snapshot.json
```

#### 3. Review Generated SQL

**Always review the generated SQL before applying:**

```bash
cat drizzle/0001_add_notes_to_debts.sql
```

Example output:
```sql
ALTER TABLE "debts" ADD COLUMN "notes" text;
```

Check for:
- Correct table and column names
- Appropriate data types
- No unintended DROP statements
- Proper indexes and constraints

#### 4. Test Migration Locally

Apply the migration to your local database:

```bash
# Using db:push for local testing
bun run db:push

# Or apply migrations
bun run db:migrate
```

Verify:
```bash
# Check schema
bun run db:verify

# Run tests
bun test
```

#### 5. Commit Migration Files

```bash
git add drizzle/
git commit -m "feat: add notes field to debts table"
git push
```

### Applying Migrations in Staging/Production

#### Option 1: Manual Migration (Recommended for Production)

1. **Connect to database**:
   ```bash
   # Set DATABASE_URL for target environment
   export DATABASE_URL="postgresql://user:pass@staging-db.neon.tech/db?sslmode=require"
   ```

2. **Apply migrations**:
   ```bash
   bun run db:migrate
   ```

3. **Verify**:
   ```bash
   bun run db:verify
   ```

#### Option 2: Automatic Migration on Deploy

Configure your deployment platform to run migrations before starting the server.

**Railway example** (`railway.json`):
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "bun run db:migrate && bun run start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Render example** (render.yaml):
```yaml
services:
  - type: web
    name: debt-snowball-api
    env: node
    buildCommand: bun install
    startCommand: bun run db:migrate && bun run start
```

### Migration Best Practices

1. **Always generate migrations for staging/production**
   - Never use `db:push` in production
   - Always review generated SQL

2. **Test migrations locally first**
   - Apply to local database
   - Run full test suite
   - Verify application works

3. **Use transactions for complex migrations**
   - Drizzle migrations are transactional by default
   - If migration fails, changes are rolled back

4. **Backup before major migrations**
   - Neon provides automatic backups
   - Create manual snapshot before major changes

5. **Plan for zero-downtime migrations**
   - Add columns as nullable first
   - Backfill data in separate step
   - Make columns non-nullable after backfill
   - Remove old columns in later migration

6. **Document breaking changes**
   - Update API documentation
   - Notify frontend team
   - Version API if needed

### Example: Zero-Downtime Column Rename

**Bad approach** (causes downtime):
```sql
ALTER TABLE debts RENAME COLUMN balance TO current_balance;
```

**Good approach** (zero downtime):

**Migration 1**: Add new column
```sql
ALTER TABLE debts ADD COLUMN current_balance numeric(12,2);
UPDATE debts SET current_balance = balance;
```

**Migration 2**: Make new column non-nullable
```sql
ALTER TABLE debts ALTER COLUMN current_balance SET NOT NULL;
```

**Migration 3**: Remove old column (after code deployed)
```sql
ALTER TABLE debts DROP COLUMN balance;
```

---

## Deployment Platforms

The Debt Snowball API can be deployed to various platforms. Here are recommended options:

### Railway (Recommended)

**Pros**:
- Easy setup with GitHub integration
- Built-in Postgres and Redis
- Automatic deployments on push
- Generous free tier
- Great developer experience

**Cons**:
- Can be expensive at scale
- Limited regions

### Render

**Pros**:
- Free tier available
- Simple configuration
- Good documentation
- Automatic SSL

**Cons**:
- Slower cold starts on free tier
- Limited customization

### Fly.io

**Pros**:
- Global edge deployment
- Excellent performance
- Flexible configuration
- Good free tier

**Cons**:
- Steeper learning curve
- More manual configuration

### Self-Hosted (VPS)

**Pros**:
- Full control
- Potentially cheaper at scale
- No vendor lock-in

**Cons**:
- More maintenance
- Need to manage infrastructure
- Security responsibility

---

## Staging Deployment

Staging environment should mirror production as closely as possible.

### 1. Set Up Staging Database

**Using Neon**:

1. Create staging database:
   - Go to [Neon Console](https://console.neon.tech)
   - Create new project: `debt-snowball-staging`
   - Copy connection string

2. Enable connection pooling:
   - In Neon console, go to Connection Details
   - Copy "Pooled connection" string
   - Format: `postgresql://user:pass@staging-db.neon.tech/db?sslmode=require`

### 2. Configure Staging Environment Variables

Set these in your deployment platform:

```bash
# Database
DATABASE_URL=postgresql://user:pass@staging-db.neon.tech/db?sslmode=require

# Authentication
BETTER_AUTH_SECRET=<generate-with-openssl-rand-base64-48>
BETTER_AUTH_URL=https://api-staging.yourdomain.com

# CORS
ALLOWED_ORIGINS=https://staging.yourdomain.com,https://api-staging.yourdomain.com

# Server
PORT=9000
NODE_ENV=production

# Logging
LOG_LEVEL=info

# Error Tracking
SENTRY_DSN=https://abc123@o123456.ingest.sentry.io/staging-project-id

# Caching (optional)
REDIS_URL=redis://username:password@staging-redis.upstash.io:6379
```

### 3. Deploy to Staging

#### Railway Deployment

1. **Connect repository**:
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login
   railway login
   
   # Link project
   railway link
   ```

2. **Configure environment**:
   ```bash
   # Set environment variables
   railway variables set DATABASE_URL="postgresql://..."
   railway variables set BETTER_AUTH_SECRET="..."
   # ... set all other variables
   ```

3. **Deploy**:
   ```bash
   # Deploy from current branch
   railway up
   
   # Or push to GitHub (auto-deploys)
   git push origin staging
   ```

#### Render Deployment

1. **Create `render.yaml`**:
   ```yaml
   services:
     - type: web
       name: debt-snowball-api-staging
       env: node
       region: oregon
       plan: starter
       buildCommand: bun install
       startCommand: bun run db:migrate && bun run start
       envVars:
         - key: DATABASE_URL
           sync: false
         - key: BETTER_AUTH_SECRET
           generateValue: true
         - key: BETTER_AUTH_URL
           value: https://debt-snowball-api-staging.onrender.com
         - key: NODE_ENV
           value: production
         - key: LOG_LEVEL
           value: info
   ```

2. **Deploy**:
   - Connect GitHub repository in Render dashboard
   - Render auto-deploys on push to staging branch

### 4. Apply Database Migrations

Migrations should run automatically on deploy (configured in start command).

**Manual migration** (if needed):
```bash
# Railway
railway run bun run db:migrate

# Render (via shell)
# Use Render shell from dashboard
bun run db:migrate
```

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

# Check API docs
open https://api-staging.yourdomain.com/docs

# Test authentication
curl -X POST https://api-staging.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

---

## Production Deployment

Production deployment follows the same process as staging but with extra precautions.

### Pre-Deployment Checklist

- [ ] All tests passing in staging
- [ ] Database migrations tested in staging
- [ ] Environment variables documented
- [ ] Sentry configured for production
- [ ] Redis configured (if using caching)
- [ ] SSL certificates configured
- [ ] CORS origins set correctly
- [ ] Rate limiting configured
- [ ] Backup strategy in place
- [ ] Monitoring and alerts configured
- [ ] Rollback plan documented

### 1. Set Up Production Database

**Using Neon**:

1. Create production database:
   - Create new project: `debt-snowball-production`
   - Choose production-grade plan
   - Enable automatic backups
   - Copy connection string with pooling

2. Configure backups:
   - Neon provides automatic backups
   - Configure retention period (7-30 days recommended)
   - Test restore procedure

### 2. Configure Production Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@prod-db.neon.tech/db?sslmode=require

# Authentication (DIFFERENT from staging!)
BETTER_AUTH_SECRET=<different-secret-from-staging>
BETTER_AUTH_URL=https://api.yourdomain.com

# CORS (production domains only)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Server
PORT=9000
NODE_ENV=production

# Logging (less verbose in production)
LOG_LEVEL=warn

# Error Tracking (production project)
SENTRY_DSN=https://xyz789@o123456.ingest.sentry.io/prod-project-id

# Caching
REDIS_URL=redis://username:password@prod-redis.upstash.io:6379
```

### 3. Deploy to Production

#### Railway Deployment

```bash
# Switch to production environment
railway environment production

# Deploy
railway up

# Or use GitHub
git push origin main  # Auto-deploys to production
```

#### Render Deployment

```bash
# Merge to main branch
git checkout main
git merge staging
git push origin main

# Render auto-deploys from main branch
```

### 4. Apply Database Migrations

**Production migrations should be applied carefully:**

1. **Create database backup** (if not automatic):
   ```bash
   # Neon provides automatic backups
   # Verify backup exists in Neon console
   ```

2. **Apply migrations**:
   ```bash
   # Migrations run automatically on deploy
   # Or manually:
   railway run bun run db:migrate
   ```

3. **Monitor for errors**:
   - Check deployment logs
   - Monitor Sentry for errors
   - Verify health endpoint

### 5. Verify Production Deployment

```bash
# Health check
curl https://api.yourdomain.com/health

# Check API docs
open https://api.yourdomain.com/docs

# Monitor logs
railway logs  # Railway
# Or check logs in platform dashboard

# Check Sentry for errors
open https://sentry.io/organizations/your-org/issues/
```

### 6. Smoke Testing

Run basic smoke tests against production:

```bash
# Test authentication
curl -X POST https://api.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest@example.com","password":"testpass123"}'

# Test protected endpoint (use token from registration)
curl https://api.yourdomain.com/orgs \
  -H "Authorization: Bearer <token>"

# Test calculation endpoint
curl https://api.yourdomain.com/orgs/<org-id>/snowball \
  -H "Authorization: Bearer <token>"
```

---

## Post-Deployment Verification

After deploying to staging or production, verify:

### 1. Application Health

```bash
# Health endpoint
curl https://api.yourdomain.com/health

# Expected: 200 OK with database connected
```

### 2. Database Connectivity

```bash
# Check logs for database connection
railway logs | grep "database"

# Should see: "Database connection successful"
```

### 3. Authentication

```bash
# Test registration
curl -X POST https://api.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Test login
curl -X POST https://api.yourdomain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

### 4. CORS Configuration

```bash
# Test CORS from allowed origin
curl -X OPTIONS https://api.yourdomain.com/health \
  -H "Origin: https://yourdomain.com" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Should see CORS headers in response
```

### 5. Error Tracking

- Check Sentry dashboard for any errors
- Verify error events are being captured
- Test error reporting by triggering a test error

### 6. Caching (if enabled)

```bash
# Check logs for Redis connection
railway logs | grep "redis"

# Should see: "Cache service initialized with Redis"
```

### 7. API Documentation

- Visit `/docs` endpoint
- Verify all endpoints are documented
- Test example requests in Scalar UI

---

## Rollback Procedures

If deployment fails or issues are discovered:

### 1. Application Rollback

#### Railway
```bash
# List deployments
railway deployments

# Rollback to previous deployment
railway rollback <deployment-id>
```

#### Render
- Go to Render dashboard
- Select service
- Click "Rollback" button
- Select previous deployment

#### Git-based Rollback
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or reset to specific commit
git reset --hard <commit-hash>
git push --force origin main
```

### 2. Database Rollback

**If migration causes issues:**

1. **Restore from backup**:
   ```bash
   # Neon: Use console to restore from backup
   # Go to Neon Console → Backups → Restore
   ```

2. **Revert migration** (if possible):
   ```sql
   -- Create down migration manually
   -- Example: Reverting added column
   ALTER TABLE debts DROP COLUMN notes;
   ```

3. **Apply revert migration**:
   ```bash
   # Create new migration file with revert SQL
   # Apply it
   bun run db:migrate
   ```

### 3. Rollback Checklist

- [ ] Identify issue and root cause
- [ ] Decide: rollback application, database, or both
- [ ] Create backup before rollback (if not automatic)
- [ ] Execute rollback
- [ ] Verify application health
- [ ] Notify team and users (if needed)
- [ ] Document incident and lessons learned
- [ ] Fix issue in development
- [ ] Test fix thoroughly
- [ ] Redeploy when ready

---

## Monitoring and Maintenance

### Application Monitoring

#### Sentry Error Tracking

1. **Configure alerts**:
   - Go to Sentry → Alerts
   - Create alert for error rate threshold
   - Set up notifications (email, Slack)

2. **Monitor key metrics**:
   - Error rate
   - Response time
   - User impact
   - Error trends

#### Platform Monitoring

**Railway**:
- Monitor CPU and memory usage in dashboard
- Set up usage alerts
- Check deployment logs regularly

**Render**:
- Monitor service health in dashboard
- Check logs for errors
- Set up uptime monitoring

### Database Monitoring

**Neon**:
- Monitor connection count
- Check query performance
- Review slow queries
- Monitor storage usage

### Uptime Monitoring

Use external uptime monitoring:

**Options**:
- [UptimeRobot](https://uptimerobot.com/) (free)
- [Pingdom](https://www.pingdom.com/)
- [Better Uptime](https://betteruptime.com/)

**Configure**:
```
Monitor URL: https://api.yourdomain.com/health
Check interval: 5 minutes
Alert on: 2 consecutive failures
Notification: Email, Slack
```

### Log Management

**Structured logging with Pino**:

```bash
# View logs
railway logs  # Railway
render logs   # Render

# Filter logs
railway logs | grep "error"
railway logs | grep "userId=123"

# Follow logs in real-time
railway logs --follow
```

### Regular Maintenance Tasks

**Daily**:
- [ ] Check Sentry for new errors
- [ ] Review error rate trends
- [ ] Monitor uptime status

**Weekly**:
- [ ] Review slow database queries
- [ ] Check resource usage (CPU, memory, storage)
- [ ] Review security alerts
- [ ] Update dependencies (if needed)

**Monthly**:
- [ ] Review and rotate secrets (if needed)
- [ ] Test backup restore procedure
- [ ] Review and optimize database indexes
- [ ] Update documentation
- [ ] Security audit

---

## Troubleshooting

### Common Deployment Issues

#### 1. Application Won't Start

**Symptoms**: Deployment fails, health check fails

**Check**:
```bash
# View logs
railway logs

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Port binding error
```

**Solutions**:
- Verify all required environment variables are set
- Check DATABASE_URL is correct and accessible
- Ensure PORT is not hardcoded (use process.env.PORT)

#### 2. Database Connection Errors

**Symptoms**: "Connection refused", "Authentication failed"

**Check**:
```bash
# Test database connection
psql $DATABASE_URL

# Check connection string format
echo $DATABASE_URL
```

**Solutions**:
- Verify DATABASE_URL format: `postgresql://user:pass@host:port/db?sslmode=require`
- Ensure database is accessible from deployment platform
- Check database user permissions
- For Neon: Ensure using pooled connection string

#### 3. Migration Failures

**Symptoms**: Migration fails during deployment

**Check**:
```bash
# View migration logs
railway logs | grep "migration"

# Common issues:
# - Conflicting schema changes
# - Missing dependencies
# - Syntax errors in SQL
```

**Solutions**:
- Review generated SQL in `drizzle/` directory
- Test migration locally first
- Check for conflicting migrations
- Rollback and fix migration, then redeploy

#### 4. CORS Errors

**Symptoms**: Browser shows CORS errors, requests blocked

**Check**:
```bash
# Test CORS
curl -X OPTIONS https://api.yourdomain.com/health \
  -H "Origin: https://yourdomain.com" \
  -v
```

**Solutions**:
- Verify ALLOWED_ORIGINS includes frontend domain
- Ensure no trailing slashes on origins
- Check protocol (http vs https) matches exactly
- Verify CORS middleware is registered in app.ts

#### 5. Authentication Issues

**Symptoms**: Login fails, sessions not persisting

**Check**:
```bash
# Check auth configuration
echo $BETTER_AUTH_SECRET
echo $BETTER_AUTH_URL

# Test auth endpoint
curl -X POST https://api.yourdomain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}' \
  -v
```

**Solutions**:
- Verify BETTER_AUTH_SECRET is at least 32 characters
- Ensure BETTER_AUTH_URL matches actual deployment URL
- Check session cookie settings (secure, httpOnly, sameSite)
- Verify Better Auth tables exist in database

#### 6. High Memory Usage

**Symptoms**: Application crashes, out of memory errors

**Check**:
```bash
# Monitor memory usage
railway metrics  # Railway
# Or check platform dashboard
```

**Solutions**:
- Increase memory allocation in platform settings
- Check for memory leaks in code
- Optimize database queries
- Enable Redis caching to reduce computation
- Review and optimize large data operations

#### 7. Slow Response Times

**Symptoms**: API requests take too long

**Check**:
```bash
# Test response time
time curl https://api.yourdomain.com/health

# Check database query performance
# Review slow query logs in Neon console
```

**Solutions**:
- Enable Redis caching for expensive calculations
- Add database indexes on frequently queried columns
- Optimize N+1 queries
- Use database connection pooling
- Consider CDN for static assets

---

## Security Checklist

Before deploying to production:

- [ ] All secrets are cryptographically random
- [ ] BETTER_AUTH_SECRET is different between environments
- [ ] HTTPS is enabled (SSL/TLS)
- [ ] CORS is restricted to known domains
- [ ] Rate limiting is enabled
- [ ] Database uses SSL connections (`?sslmode=require`)
- [ ] Error messages don't expose sensitive data
- [ ] Audit logging is enabled
- [ ] Sentry is configured (no sensitive data in errors)
- [ ] Dependencies are up to date
- [ ] Environment variables are not committed to git
- [ ] Database backups are enabled
- [ ] Monitoring and alerts are configured

---

## Related Documentation

- **[CI/CD Setup Guide](./CI_CD_SETUP.md)** - Complete CI/CD pipeline configuration
- **[Environment Setup Guide](./ENVIRONMENT_SETUP.md)** - Detailed environment configuration for staging and production
- **[Monitoring and Alerts](./MONITORING_ALERTS.md)** - Comprehensive monitoring and alerting setup
- **[Deployment Checklist](./DEPLOYMENT_CHECKLIST.md)** - Step-by-step deployment checklist
- **[Environment Variables](./ENVIRONMENT_VARIABLES.md)** - Complete environment variable reference

## Additional Resources

- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Neon Documentation](https://neon.tech/docs)
- [Better Auth Documentation](https://better-auth.com/docs)
- [Railway Documentation](https://docs.railway.app/)
- [Render Documentation](https://render.com/docs)
- [Sentry Documentation](https://docs.sentry.io/)

---

## Support

For issues or questions:

1. Check this documentation and related guides
2. Review application logs
3. Check Sentry for errors
4. Consult platform documentation
5. Contact team lead or DevOps

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
