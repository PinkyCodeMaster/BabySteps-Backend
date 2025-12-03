# Deployment Setup Summary

This document provides a quick overview of the deployment infrastructure and how to get started.

## 📋 Quick Start

### For First-Time Setup

1. **Configure Environment**:
   ```bash
   bun run setup:env staging
   bun run setup:env production
   ```

2. **Set Up CI/CD**:
   - Add GitHub secrets (see [CI_CD_SETUP.md](./CI_CD_SETUP.md))
   - Configure Railway/Render tokens
   - Set up Sentry projects

3. **Configure Monitoring**:
   - Set up Sentry projects
   - Configure UptimeRobot monitors
   - Set up Slack webhooks

4. **Deploy to Staging**:
   ```bash
   git checkout staging
   git merge develop
   git push origin staging
   ```

5. **Verify Deployment**:
   ```bash
   bun run smoke:staging
   ```

### For Regular Deployments

1. **Deploy to Staging**:
   ```bash
   bun run deploy:staging
   ```

2. **Test in Staging**:
   ```bash
   bun run smoke:staging
   ```

3. **Deploy to Production**:
   ```bash
   bun run deploy:production
   ```

4. **Verify Production**:
   ```bash
   bun run smoke:production
   ```

---

## 📚 Documentation Structure

### Core Deployment Docs

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **[DEPLOYMENT.md](./DEPLOYMENT.md)** | Main deployment guide | First-time setup, reference |
| **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** | Step-by-step checklist | Before every deployment |
| **[CI_CD_SETUP.md](./CI_CD_SETUP.md)** | CI/CD pipeline configuration | Setting up automation |
| **[ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)** | Environment configuration | Setting up staging/production |
| **[MONITORING_ALERTS.md](./MONITORING_ALERTS.md)** | Monitoring and alerting | Setting up observability |

### Supporting Docs

| Document | Purpose |
|----------|---------|
| **[ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)** | All environment variables |
| **[README.md](./README.md)** | Project overview and setup |
| **[SETUP.md](./SETUP.md)** | Initial project setup |

---

## 🏗️ Infrastructure Overview

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Repository                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ├─── Push to 'staging' branch
                     │    │
                     │    ▼
                     │    ┌──────────────────────────┐
                     │    │   GitHub Actions CI/CD   │
                     │    │   - Run tests            │
                     │    │   - Build application    │
                     │    │   - Deploy to Railway    │
                     │    └──────────┬───────────────┘
                     │               │
                     │               ▼
                     │    ┌──────────────────────────┐
                     │    │  Staging Environment     │
                     │    │  - Railway/Render        │
                     │    │  - Neon Postgres         │
                     │    │  - Upstash Redis         │
                     │    └──────────────────────────┘
                     │
                     └─── Push to 'main' branch
                          │
                          ▼
                          ┌──────────────────────────┐
                          │   GitHub Actions CI/CD   │
                          │   - Run tests            │
                          │   - Build application    │
                          │   - Deploy to Railway    │
                          │   - Create Sentry release│
                          └──────────┬───────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────┐
                          │  Production Environment  │
                          │  - Railway/Render        │
                          │  - Neon Postgres         │
                          │  - Upstash Redis         │
                          │  - Sentry monitoring     │
                          └──────────────────────────┘
```

### Technology Stack

**Runtime & Framework**:
- Bun (JavaScript runtime)
- Hono (Web framework)
- TypeScript

**Database & Caching**:
- Neon Postgres (Serverless PostgreSQL)
- Upstash Redis (Serverless Redis)
- Drizzle ORM

**Deployment Platforms** (choose one):
- Railway (recommended)
- Render
- Fly.io
- Docker (self-hosted)

**Monitoring & Observability**:
- Sentry (Error tracking)
- UptimeRobot (Uptime monitoring)
- Pino (Structured logging)

**CI/CD**:
- GitHub Actions

---

## 🔧 Configuration Files

### CI/CD Configuration

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Main CI/CD pipeline |
| `.github/workflows/security-scan.yml` | Security scanning |
| `.github/workflows/property-tests.yml` | Property-based testing |

### Platform Configuration

| File | Purpose |
|------|---------|
| `railway.json` | Railway deployment config |
| `render.yaml` | Render deployment config |
| `fly.toml` | Fly.io deployment config |
| `Dockerfile` | Docker container config |
| `.dockerignore` | Docker build exclusions |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/smoke-tests.sh` | Post-deployment verification |
| `scripts/setup-environment.sh` | Environment setup helper |
| `scripts/backup-database.sh` | Database backup script |

---

## 🔐 Required Secrets

### GitHub Secrets

Set these in: `Settings → Secrets and variables → Actions`

**Required**:
- `RAILWAY_TOKEN_STAGING` - Railway API token for staging
- `RAILWAY_TOKEN_PRODUCTION` - Railway API token for production
- `CODECOV_TOKEN` - Codecov upload token
- `SLACK_WEBHOOK` - Slack webhook for notifications

**Optional**:
- `SENTRY_AUTH_TOKEN` - Sentry API token
- `SENTRY_ORG` - Sentry organization slug

### Environment Variables

Set these in your deployment platform:

**Required**:
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Authentication secret (min 32 chars)
- `BETTER_AUTH_URL` - API URL
- `ALLOWED_ORIGINS` - CORS allowed origins
- `NODE_ENV` - Environment (production)
- `PORT` - Server port (9000)
- `LOG_LEVEL` - Logging level (warn for prod)

**Optional**:
- `SENTRY_DSN` - Sentry error tracking
- `REDIS_URL` - Redis caching
- `RATE_LIMIT_*` - Rate limiting configuration

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for complete list.

---

## 🚀 Deployment Workflow

### Branch Strategy

```
main (production)
  ├── staging
  │   └── develop
  │       └── feature/*
  └── hotfix/*
```

### Standard Deployment Flow

1. **Feature Development**:
   ```bash
   git checkout develop
   git checkout -b feature/my-feature
   # Make changes
   git commit -m "feat: add my feature"
   git push origin feature/my-feature
   # Create PR to develop
   ```

2. **Deploy to Staging**:
   ```bash
   git checkout staging
   git merge develop
   git push origin staging
   # Auto-deploys to staging
   ```

3. **Test in Staging**:
   ```bash
   bun run smoke:staging
   # Manual testing
   ```

4. **Deploy to Production**:
   ```bash
   git checkout main
   git merge staging
   git push origin main
   # Auto-deploys to production
   ```

5. **Verify Production**:
   ```bash
   bun run smoke:production
   # Monitor for 30 minutes
   ```

### Hotfix Flow

1. **Create Hotfix**:
   ```bash
   git checkout main
   git checkout -b hotfix/critical-fix
   # Make fix
   git commit -m "fix: critical bug"
   ```

2. **Deploy to Production**:
   ```bash
   git checkout main
   git merge hotfix/critical-fix
   git push origin main
   ```

3. **Backport to Other Branches**:
   ```bash
   git checkout staging
   git merge hotfix/critical-fix
   git push origin staging
   
   git checkout develop
   git merge hotfix/critical-fix
   git push origin develop
   ```

---

## 📊 Monitoring Dashboard

### Key Metrics to Monitor

**Application Health**:
- ✅ Uptime (target: 99.9%)
- ⚡ Response time (target: P95 < 500ms)
- 🐛 Error rate (target: < 1%)
- 👥 Active users

**Infrastructure**:
- 💾 Database connections
- 🔄 Redis cache hit rate
- 💻 CPU usage
- 🧠 Memory usage

**Business Metrics**:
- 📈 New organizations
- 💰 Debts paid off
- 📊 Baby Steps progress
- 🔢 API requests

### Monitoring Tools

| Tool | Purpose | URL |
|------|---------|-----|
| **Sentry** | Error tracking | https://sentry.io |
| **UptimeRobot** | Uptime monitoring | https://uptimerobot.com |
| **Railway** | Platform metrics | https://railway.app |
| **Neon** | Database metrics | https://console.neon.tech |

---

## 🆘 Emergency Procedures

### Service Down

1. **Check Status**:
   ```bash
   curl https://api.yourdomain.com/health
   ```

2. **Check Logs**:
   ```bash
   railway logs --tail 100
   ```

3. **Check Sentry**:
   - Go to Sentry dashboard
   - Review recent errors

4. **Rollback if Needed**:
   ```bash
   railway rollback <previous-deployment-id>
   ```

### Database Issues

1. **Check Connections**:
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```

2. **Kill Idle Connections**:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
   AND state_change < NOW() - INTERVAL '5 minutes';
   ```

3. **Contact Neon Support**:
   - Email: support@neon.tech
   - Dashboard: https://console.neon.tech

### High Error Rate

1. **Identify Errors**:
   - Check Sentry dashboard
   - Review error patterns

2. **Assess Impact**:
   - How many users affected?
   - What functionality broken?

3. **Decide Action**:
   - Hotfix if critical
   - Rollback if widespread
   - Monitor if minor

---

## 📞 Support Contacts

### On-Call Rotation

- **Primary**: [Name] - [Phone] - [Email]
- **Secondary**: [Name] - [Phone] - [Email]
- **Escalation**: [Name] - [Phone] - [Email]

### External Support

- **Neon**: support@neon.tech
- **Railway**: team@railway.app
- **Sentry**: support@sentry.io
- **Upstash**: support@upstash.com

### Internal Channels

- **Slack #alerts**: Critical alerts
- **Slack #deployments**: Deployment notifications
- **Slack #engineering**: General discussion

---

## ✅ Pre-Deployment Checklist

Quick checklist before deploying:

- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Database migrations tested
- [ ] Environment variables configured
- [ ] Secrets rotated (if needed)
- [ ] Monitoring configured
- [ ] Rollback plan documented
- [ ] Team notified

See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for complete checklist.

---

## 📖 Additional Resources

### Internal Documentation

- [API Documentation](https://api.yourdomain.com/docs)
- [Status Page](https://status.yourdomain.com)
- [Runbook](./RUNBOOK.md) (if exists)

### External Documentation

- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Neon Documentation](https://neon.tech/docs)
- [Railway Documentation](https://docs.railway.app/)

---

## 🎯 Next Steps

After completing deployment setup:

1. **Test the Pipeline**:
   - Make a small change
   - Deploy to staging
   - Verify automation works

2. **Configure Monitoring**:
   - Set up Sentry alerts
   - Configure UptimeRobot
   - Test Slack notifications

3. **Document Custom Procedures**:
   - Add team-specific processes
   - Document any custom scripts
   - Update contact information

4. **Train Team**:
   - Walk through deployment process
   - Practice rollback procedure
   - Review incident response

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
