# Deployment Checklist

Use this checklist before deploying to staging or production environments.

## Pre-Deployment Checklist

### Code Quality

- [ ] All tests passing locally (`bun test`)
- [ ] Linter passing (`bun run lint`)
- [ ] Property-based tests passing (100+ iterations)
- [ ] No console.log statements in production code
- [ ] No commented-out code blocks
- [ ] Code reviewed and approved

### Database

- [ ] Database migrations generated (`bun run db:generate`)
- [ ] Migration SQL reviewed for correctness
- [ ] Migrations tested in local environment
- [ ] Migrations tested in staging environment
- [ ] Database backup created (production only)
- [ ] Rollback plan documented

### Environment Configuration

- [ ] All required environment variables documented
- [ ] Secrets generated and stored securely
- [ ] CORS origins configured correctly
- [ ] Rate limiting configured appropriately
- [ ] Feature flags set correctly
- [ ] Sentry DSN configured
- [ ] Redis URL configured (if using caching)

### Security

- [ ] BETTER_AUTH_SECRET is different between environments
- [ ] All secrets are cryptographically random (min 32 chars)
- [ ] HTTPS/TLS enabled
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] CORS restricted to known domains
- [ ] No sensitive data in error messages
- [ ] Audit logging enabled

### Documentation

- [ ] CHANGELOG.md updated
- [ ] API documentation updated (if endpoints changed)
- [ ] README.md updated (if setup changed)
- [ ] Environment variables documented
- [ ] Breaking changes documented
- [ ] Migration notes added (if applicable)

### Monitoring

- [ ] Sentry configured and tested
- [ ] Uptime monitoring configured
- [ ] Slack notifications configured
- [ ] Alert thresholds reviewed
- [ ] Health check endpoint working
- [ ] Metrics endpoint accessible (if applicable)

### Testing

- [ ] Unit tests passing
- [ ] Property-based tests passing
- [ ] Integration tests passing (if applicable)
- [ ] Smoke tests prepared
- [ ] Load testing completed (production only)

---

## Staging Deployment Checklist

### Before Deployment

- [ ] Create feature branch from `develop`
- [ ] Complete all changes and commit
- [ ] Push to remote repository
- [ ] Create pull request to `staging`
- [ ] Code review completed
- [ ] CI/CD pipeline passing
- [ ] Merge to `staging` branch

### During Deployment

- [ ] Monitor deployment logs
- [ ] Verify database migrations applied
- [ ] Check application started successfully
- [ ] Verify health check endpoint responding

### After Deployment

- [ ] Run smoke tests (`bun run smoke:staging`)
- [ ] Test authentication flow
- [ ] Test critical API endpoints
- [ ] Verify CORS configuration
- [ ] Check Sentry for errors
- [ ] Monitor logs for issues
- [ ] Test new features/changes
- [ ] Notify team of deployment

### Rollback (if needed)

- [ ] Identify issue and root cause
- [ ] Decide on rollback strategy
- [ ] Execute rollback (revert commit or Railway rollback)
- [ ] Verify application health after rollback
- [ ] Document issue and lessons learned

---

## Production Deployment Checklist

### Before Deployment

- [ ] All staging tests passed
- [ ] Staging environment stable for 24+ hours
- [ ] Database migrations tested in staging
- [ ] Load testing completed (if significant changes)
- [ ] Rollback plan documented
- [ ] Team notified of deployment window
- [ ] Maintenance window scheduled (if needed)
- [ ] Backup created (automatic via Neon)

### Pre-Deployment Verification

- [ ] Review CHANGELOG.md
- [ ] Review database migrations
- [ ] Verify environment variables
- [ ] Check Sentry configuration
- [ ] Verify monitoring and alerts
- [ ] Confirm rollback procedure
- [ ] Notify stakeholders (if user-facing changes)

### During Deployment

- [ ] Merge `staging` to `main` branch
- [ ] Monitor CI/CD pipeline
- [ ] Watch deployment logs
- [ ] Verify database migrations applied
- [ ] Check application started successfully
- [ ] Monitor Sentry for errors
- [ ] Watch Slack alerts

### Post-Deployment Verification

- [ ] Run smoke tests (`bun run smoke:production`)
- [ ] Verify health check endpoint
- [ ] Test authentication flow
- [ ] Test critical user journeys:
  - [ ] User registration
  - [ ] User login
  - [ ] Create organization
  - [ ] Add income/expense/debt
  - [ ] Calculate snowball
  - [ ] Record payment
- [ ] Verify API documentation accessible
- [ ] Check CORS configuration
- [ ] Test rate limiting
- [ ] Monitor response times
- [ ] Check database connection count
- [ ] Verify Redis connection (if using)
- [ ] Review Sentry for new errors
- [ ] Monitor logs for 30 minutes

### Post-Deployment Tasks

- [ ] Create Sentry release (automatic via CI/CD)
- [ ] Update status page (if applicable)
- [ ] Notify team of successful deployment
- [ ] Notify stakeholders (if user-facing changes)
- [ ] Monitor for 24 hours
- [ ] Document any issues encountered
- [ ] Update runbook (if procedures changed)

### Rollback (if needed)

- [ ] Identify issue and severity
- [ ] Assess impact on users
- [ ] Decide on rollback vs. hotfix
- [ ] Execute rollback:
  - [ ] Railway: `railway rollback <deployment-id>`
  - [ ] Git: Revert commit and push
- [ ] Verify application health after rollback
- [ ] Notify team and stakeholders
- [ ] Create incident report
- [ ] Schedule post-mortem (within 48 hours)
- [ ] Document lessons learned

---

## Hotfix Deployment Checklist

### When to Use Hotfix

- Critical bug in production
- Security vulnerability
- Data integrity issue
- Service outage

### Hotfix Process

- [ ] Create hotfix branch from `main`
- [ ] Implement fix (minimal changes only)
- [ ] Test fix locally
- [ ] Create pull request
- [ ] Fast-track code review
- [ ] Merge to `main` (deploy to production)
- [ ] Merge to `staging` and `develop`
- [ ] Monitor production closely
- [ ] Verify fix resolved issue
- [ ] Document in CHANGELOG.md
- [ ] Create incident report

---

## Emergency Rollback Procedure

### Quick Rollback Steps

1. **Identify Issue**:
   ```bash
   # Check logs
   railway logs --tail 100
   
   # Check Sentry
   open https://sentry.io/organizations/your-org/issues/
   ```

2. **Execute Rollback**:
   ```bash
   # Railway
   railway deployments
   railway rollback <previous-deployment-id>
   
   # Or Git revert
   git revert HEAD
   git push origin main
   ```

3. **Verify Rollback**:
   ```bash
   # Health check
   curl https://api.yourdomain.com/health
   
   # Run smoke tests
   bun run smoke:production
   ```

4. **Notify Team**:
   - Post in Slack #alerts
   - Email team
   - Update status page

5. **Post-Rollback**:
   - Monitor for 30 minutes
   - Document issue
   - Plan fix
   - Schedule post-mortem

---

## Deployment Communication Template

### Pre-Deployment Announcement

```
📢 Deployment Scheduled

Environment: Production
Date: 2024-01-15
Time: 14:00 UTC (30 minutes)
Duration: ~15 minutes
Impact: None expected

Changes:
- Feature: Add export endpoint
- Fix: Improve snowball calculation performance
- Chore: Update dependencies

Rollback plan: Revert to previous deployment if issues arise

Questions? Ask in #deployments
```

### Deployment In Progress

```
🚀 Deployment In Progress

Environment: Production
Status: Deploying...
Started: 14:00 UTC

Monitoring: https://railway.app/project/...
```

### Deployment Complete

```
✅ Deployment Complete

Environment: Production
Status: Success
Duration: 12 minutes
Completed: 14:12 UTC

Changes deployed:
- Feature: Add export endpoint ✅
- Fix: Improve snowball calculation performance ✅
- Chore: Update dependencies ✅

Smoke tests: Passed ✅
Monitoring: All systems normal

Release notes: https://github.com/your-org/repo/releases/v1.2.0
```

### Deployment Failed

```
❌ Deployment Failed

Environment: Production
Status: Rolled back
Issue: Database migration failed
Duration: 8 minutes

Action taken: Rolled back to previous version
Current status: Service restored

Next steps:
1. Investigate migration issue
2. Fix and test in staging
3. Reschedule deployment

Incident report: [Link to post-mortem]
```

---

## Post-Deployment Monitoring

### First 30 Minutes

- [ ] Monitor Sentry for new errors
- [ ] Watch response times in Railway/Render dashboard
- [ ] Check database connection count
- [ ] Review application logs
- [ ] Monitor Slack alerts
- [ ] Check uptime monitoring status

### First 24 Hours

- [ ] Review error rate trends
- [ ] Check performance metrics
- [ ] Monitor database query performance
- [ ] Review cache hit rates
- [ ] Check for memory leaks
- [ ] Monitor user feedback

### First Week

- [ ] Analyze business metrics
- [ ] Review slow queries
- [ ] Check for edge cases
- [ ] Monitor resource usage trends
- [ ] Gather user feedback
- [ ] Document lessons learned

---

## Useful Commands

### Deployment

```bash
# Deploy to staging
bun run deploy:staging

# Deploy to production
bun run deploy:production

# Run smoke tests
bun run smoke:staging
bun run smoke:production
```

### Monitoring

```bash
# View logs (Railway)
railway logs --tail 100
railway logs --follow

# View logs (Fly.io)
fly logs

# Check deployments
railway deployments

# Rollback (Railway)
railway rollback <deployment-id>
```

### Database

```bash
# Generate migration
bun run db:generate

# Apply migration
bun run db:migrate

# Verify schema
bun run db:verify

# Backup database
pg_dump $DATABASE_URL > backup.sql
```

### Testing

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run property tests
bun test --grep "property"

# Run smoke tests
bash scripts/smoke-tests.sh production
```

---

## Contacts

### On-Call Rotation

- **Primary**: [Name] - [Phone] - [Email]
- **Secondary**: [Name] - [Phone] - [Email]
- **Escalation**: [Name] - [Phone] - [Email]

### External Services

- **Neon Support**: support@neon.tech
- **Railway Support**: team@railway.app
- **Sentry Support**: support@sentry.io

### Internal Channels

- **Slack #alerts**: Critical alerts
- **Slack #deployments**: Deployment notifications
- **Slack #engineering**: General engineering discussion

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
