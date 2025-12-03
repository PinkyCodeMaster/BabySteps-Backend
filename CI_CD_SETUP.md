# CI/CD Setup Guide

This document explains the CI/CD pipeline configuration for the Debt Snowball API.

## Table of Contents

1. [Overview](#overview)
2. [GitHub Actions Workflows](#github-actions-workflows)
3. [Required Secrets](#required-secrets)
4. [Deployment Platforms](#deployment-platforms)
5. [Branch Strategy](#branch-strategy)
6. [Monitoring and Alerts](#monitoring-and-alerts)

---

## Overview

The Debt Snowball API uses GitHub Actions for continuous integration and deployment. The pipeline includes:

- **Automated testing** on every push and pull request
- **Security scanning** for vulnerabilities and secrets
- **Property-based testing** with extended nightly runs
- **Automated deployment** to staging and production environments
- **Health checks** and smoke tests after deployment
- **Notifications** via Slack for deployment status

### Pipeline Architecture

```
┌─────────────┐
│   Push/PR   │
└──────┬──────┘
       │
       ├─────────────────────────────────────┐
       │                                     │
       ▼                                     ▼
┌──────────────┐                    ┌──────────────┐
│  Run Tests   │                    │Security Scan │
│  - Lint      │                    │  - Deps      │
│  - Unit      │                    │  - Code      │
│  - Property  │                    │  - Secrets   │
└──────┬───────┘                    └──────────────┘
       │
       ▼
┌──────────────┐
│    Build     │
└──────┬───────┘
       │
       ├─────────────────┬─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────┐      ┌──────────┐     ┌──────────┐
│  Deploy  │      │  Deploy  │     │  Deploy  │
│  Staging │      │   Prod   │     │  Manual  │
└──────────┘      └──────────┘     └──────────┘
```

---

## GitHub Actions Workflows

### 1. Main CI/CD Pipeline (`ci.yml`)

**Triggers**:
- Push to `main`, `staging`, or `develop` branches
- Pull requests to these branches

**Jobs**:

#### Test Job
- Sets up PostgreSQL test database
- Installs dependencies with Bun
- Runs linter
- Runs unit and property-based tests
- Uploads coverage to Codecov

#### Build Job
- Builds the application
- Uploads build artifacts

#### Deploy Staging Job
- Triggers on push to `staging` branch
- Deploys to Railway staging environment
- Runs health checks
- Sends Slack notification

#### Deploy Production Job
- Triggers on push to `main` branch
- Deploys to Railway production environment
- Runs health checks and smoke tests
- Creates Sentry release
- Sends Slack notification

### 2. Security Scan (`security-scan.yml`)

**Triggers**:
- Push to main branches
- Pull requests
- Weekly schedule (Mondays at 9 AM UTC)

**Jobs**:
- **Dependency Scan**: Checks for vulnerable dependencies
- **Code Scan**: Uses Trivy to scan for security issues
- **Secret Scan**: Uses TruffleHog to detect leaked secrets

### 3. Property-Based Tests (`property-tests.yml`)

**Triggers**:
- Push to main branches
- Pull requests
- Nightly schedule (2 AM UTC)

**Jobs**:
- Runs property-based tests with 100 iterations (normal)
- Runs extended tests with 1000 iterations (nightly)
- Uploads test results
- Notifies on failure

---

## Required Secrets

Configure these secrets in your GitHub repository settings:

### GitHub Secrets

Go to: `Settings → Secrets and variables → Actions → New repository secret`

#### Required for All Environments

| Secret Name | Description | How to Generate |
|------------|-------------|-----------------|
| `CODECOV_TOKEN` | Codecov upload token | Get from [codecov.io](https://codecov.io) |
| `SLACK_WEBHOOK` | Slack webhook for notifications | Create in Slack workspace settings |

#### Required for Railway Deployment

| Secret Name | Description | How to Generate |
|------------|-------------|-----------------|
| `RAILWAY_TOKEN_STAGING` | Railway API token for staging | `railway login` then `railway whoami --token` |
| `RAILWAY_TOKEN_PRODUCTION` | Railway API token for production | Use separate token for production |

#### Required for Sentry Integration

| Secret Name | Description | How to Generate |
|------------|-------------|-----------------|
| `SENTRY_AUTH_TOKEN` | Sentry authentication token | Create in Sentry → Settings → Auth Tokens |
| `SENTRY_ORG` | Sentry organization slug | Found in Sentry URL |

### Generating Secrets

#### Railway Tokens

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Get token
railway whoami --token
```

#### Sentry Auth Token

1. Go to Sentry → Settings → Account → API → Auth Tokens
2. Click "Create New Token"
3. Select scopes: `project:releases`, `org:read`
4. Copy token

#### Slack Webhook

1. Go to Slack workspace → Apps → Incoming Webhooks
2. Click "Add to Slack"
3. Choose channel for notifications
4. Copy webhook URL

---

## Deployment Platforms

The repository includes configuration for multiple deployment platforms:

### Railway (Recommended)

**Configuration**: `railway.json`

**Features**:
- Automatic deployments on push
- Built-in database and Redis
- Easy environment management
- Excellent developer experience

**Setup**:

1. **Create Railway project**:
   ```bash
   railway login
   railway init
   ```

2. **Add PostgreSQL**:
   ```bash
   railway add --database postgres
   ```

3. **Add Redis** (optional):
   ```bash
   railway add --database redis
   ```

4. **Set environment variables**:
   ```bash
   railway variables set BETTER_AUTH_SECRET="your-secret-here"
   railway variables set ALLOWED_ORIGINS="https://yourdomain.com"
   # ... set all required variables
   ```

5. **Deploy**:
   ```bash
   railway up
   ```

### Render

**Configuration**: `render.yaml`

**Features**:
- Free tier available
- Infrastructure as code
- Automatic SSL
- Simple configuration

**Setup**:

1. Connect GitHub repository in Render dashboard
2. Render reads `render.yaml` automatically
3. Set environment variables in dashboard
4. Deploy automatically on push

### Fly.io

**Configuration**: `fly.toml`

**Features**:
- Global edge deployment
- Excellent performance
- Flexible configuration

**Setup**:

1. **Install Fly CLI**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login**:
   ```bash
   fly auth login
   ```

3. **Launch app**:
   ```bash
   fly launch
   ```

4. **Set secrets**:
   ```bash
   fly secrets set DATABASE_URL="postgresql://..."
   fly secrets set BETTER_AUTH_SECRET="..."
   # ... set all required secrets
   ```

5. **Deploy**:
   ```bash
   fly deploy
   ```

### Docker (Self-Hosted)

**Configuration**: `Dockerfile`, `.dockerignore`

**Prerequisites**:
- Docker Desktop installed and running
- Migrations generated (optional): `bun run db:generate`

**Build and run**:

```bash
# Build image
docker build -t debt-snowball-api .

# Run container
docker run -d \
  -p 9000:9000 \
  -e DATABASE_URL="postgresql://..." \
  -e BETTER_AUTH_SECRET="..." \
  --name debt-snowball-api \
  debt-snowball-api
```

**Note**: See [DOCKER_BUILD_NOTES.md](./DOCKER_BUILD_NOTES.md) for detailed Docker build information, troubleshooting, and the recent drizzle directory fix.

**Docker Compose** (with PostgreSQL and Redis):

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "9000:9000"
    environment:
      DATABASE_URL: postgresql://user:pass@postgres:5432/debt_snowball
      REDIS_URL: redis://redis:6379
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS}
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: debt_snowball
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## Branch Strategy

### Branch Structure

```
main (production)
  ├── staging
  │   └── develop
  │       └── feature/*
  └── hotfix/*
```

### Branch Policies

#### `main` (Production)
- Protected branch
- Requires pull request reviews
- Requires passing CI checks
- Auto-deploys to production on merge
- No direct commits allowed

#### `staging`
- Protected branch
- Requires pull request reviews
- Requires passing CI checks
- Auto-deploys to staging on merge
- Merge from `develop` for releases

#### `develop`
- Integration branch
- Requires passing CI checks
- Merge feature branches here
- Regularly merge to `staging` for testing

#### `feature/*`
- Feature development branches
- Create from `develop`
- Merge back to `develop` via PR
- Naming: `feature/add-export-endpoint`

#### `hotfix/*`
- Emergency fixes for production
- Create from `main`
- Merge to both `main` and `develop`
- Naming: `hotfix/fix-auth-bug`

### Workflow Example

**Feature Development**:
```bash
# Create feature branch
git checkout develop
git pull origin develop
git checkout -b feature/add-notifications

# Make changes and commit
git add .
git commit -m "feat: add email notifications"

# Push and create PR
git push origin feature/add-notifications
# Create PR: feature/add-notifications → develop
```

**Release to Staging**:
```bash
# Merge develop to staging
git checkout staging
git pull origin staging
git merge develop
git push origin staging
# Auto-deploys to staging
```

**Release to Production**:
```bash
# After testing in staging
git checkout main
git pull origin main
git merge staging
git push origin main
# Auto-deploys to production
```

**Hotfix**:
```bash
# Create hotfix branch
git checkout main
git pull origin main
git checkout -b hotfix/fix-critical-bug

# Fix and commit
git add .
git commit -m "fix: resolve critical auth issue"

# Merge to main
git checkout main
git merge hotfix/fix-critical-bug
git push origin main

# Also merge to develop
git checkout develop
git merge hotfix/fix-critical-bug
git push origin develop

# Delete hotfix branch
git branch -d hotfix/fix-critical-bug
```

---

## Monitoring and Alerts

### Health Checks

All deployments include automatic health checks:

**Endpoint**: `GET /health`

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected",
  "version": "1.0.0"
}
```

**Check Frequency**:
- Railway: Every 30 seconds
- Render: Every 30 seconds
- Fly.io: Every 10 seconds

### Slack Notifications

Notifications are sent for:
- ✅ Successful deployments
- ❌ Failed deployments
- ⚠️ Failed property tests (nightly)
- 🔒 Security scan findings

**Configure Slack**:

1. Create Slack app with Incoming Webhooks
2. Add webhook URL to GitHub secrets
3. Notifications sent to configured channel

### Sentry Error Tracking

**Features**:
- Real-time error tracking
- Stack traces and context
- Release tracking
- Performance monitoring

**Setup**:

1. Create Sentry project
2. Add `SENTRY_DSN` to environment variables
3. Add Sentry tokens to GitHub secrets
4. Releases created automatically on production deploy

### Uptime Monitoring

**Recommended Services**:
- [UptimeRobot](https://uptimerobot.com/) - Free tier available
- [Better Uptime](https://betteruptime.com/) - Great UI
- [Pingdom](https://www.pingdom.com/) - Enterprise option

**Configuration**:
```
Monitor: https://api.yourdomain.com/health
Interval: 5 minutes
Alert on: 2 consecutive failures
Notification: Email, Slack, SMS
```

### Log Aggregation

**Options**:
- Railway: Built-in log viewer
- Render: Built-in log viewer
- Fly.io: `fly logs` command
- External: Datadog, Logtail, Papertrail

**Structured Logging**:

The application uses Pino for structured logging:

```typescript
logger.info({
  userId: '123',
  organizationId: '456',
  action: 'debt_payment',
  amount: 100.00
}, 'Payment recorded');
```

**Log Levels**:
- `debug`: Development only
- `info`: Staging
- `warn`: Production
- `error`: Always logged

---

## Troubleshooting CI/CD

### Common Issues

#### 1. Tests Failing in CI but Passing Locally

**Cause**: Environment differences

**Solution**:
```bash
# Run tests with CI environment
DATABASE_URL="postgresql://localhost:5432/test" bun test

# Check for timing issues
bun test --timeout 10000
```

#### 2. Deployment Fails with "Health Check Failed"

**Cause**: Application not starting or database connection issues

**Solution**:
```bash
# Check deployment logs
railway logs  # Railway
fly logs      # Fly.io

# Verify environment variables
railway variables  # Railway
fly secrets list   # Fly.io

# Test health endpoint locally
curl http://localhost:9000/health
```

#### 3. Database Migration Fails

**Cause**: Migration conflicts or syntax errors

**Solution**:
```bash
# Review migration files
cat drizzle/0001_*.sql

# Test migration locally
bun run db:migrate

# Rollback if needed (manual)
# Connect to database and revert changes
```

#### 4. Build Artifacts Too Large

**Cause**: Including unnecessary files

**Solution**:
- Review `.dockerignore`
- Exclude `node_modules` from artifacts
- Use multi-stage Docker builds

#### 5. Secrets Not Available

**Cause**: Secrets not configured in GitHub

**Solution**:
```bash
# Verify secrets exist
# Go to: Settings → Secrets and variables → Actions

# Check secret names match workflow
# Secrets are case-sensitive
```

---

## Best Practices

### 1. Environment Parity

Keep staging and production as similar as possible:
- Same database version
- Same Node/Bun version
- Same environment variables (different values)
- Same resource allocation

### 2. Database Migrations

- Always test migrations in staging first
- Review generated SQL before applying
- Use transactions for safety
- Keep migrations small and focused
- Document breaking changes

### 3. Secrets Management

- Never commit secrets to git
- Use different secrets per environment
- Rotate secrets regularly
- Use strong, random values
- Document required secrets

### 4. Testing

- Run full test suite before merging
- Use property-based tests for critical logic
- Test migrations before deploying
- Run smoke tests after deployment

### 5. Monitoring

- Set up alerts for critical errors
- Monitor response times
- Track deployment frequency
- Review logs regularly
- Test backup restoration

### 6. Rollback Plan

- Document rollback procedures
- Test rollback process
- Keep previous version available
- Communicate with team during rollback

---

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Railway Documentation](https://docs.railway.app/)
- [Render Documentation](https://render.com/docs)
- [Fly.io Documentation](https://fly.io/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [Sentry Documentation](https://docs.sentry.io/)

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
