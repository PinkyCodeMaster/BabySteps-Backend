# Monitoring and Alerts Configuration

This document provides detailed configuration for monitoring and alerting across all environments.

## Table of Contents

1. [Monitoring Stack Overview](#monitoring-stack-overview)
2. [Sentry Configuration](#sentry-configuration)
3. [Uptime Monitoring](#uptime-monitoring)
4. [Database Monitoring](#database-monitoring)
5. [Performance Monitoring](#performance-monitoring)
6. [Alert Configuration](#alert-configuration)
7. [Incident Response](#incident-response)

---

## Monitoring Stack Overview

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    Monitoring Stack                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │    Sentry    │  │ UptimeRobot  │  │     Neon     │ │
│  │ Error Track  │  │   Uptime     │  │   Database   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Upstash    │  │    Slack     │  │   Railway    │ │
│  │    Redis     │  │Notifications │  │   Platform   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Monitoring Objectives

- **Availability**: 99.9% uptime target
- **Performance**: P95 response time < 500ms
- **Errors**: Error rate < 1%
- **Database**: Query time < 100ms (P95)
- **Recovery**: MTTR < 15 minutes

---

## Sentry Configuration

### Project Setup

#### Staging Project

1. **Create Project**:
   - Go to Sentry → Projects → Create Project
   - Platform: Node.js
   - Name: `debt-snowball-api-staging`
   - Team: Your team

2. **Get DSN**:
   ```
   https://abc123@o123456.ingest.sentry.io/staging-id
   ```

3. **Configure in Application**:
   ```bash
   SENTRY_DSN=https://abc123@o123456.ingest.sentry.io/staging-id
   SENTRY_ENVIRONMENT=staging
   SENTRY_TRACES_SAMPLE_RATE=0.5
   ```

#### Production Project

1. **Create Project**:
   - Platform: Node.js
   - Name: `debt-snowball-api-production`
   - Team: Your team

2. **Get DSN**:
   ```
   https://xyz789@o123456.ingest.sentry.io/prod-id
   ```

3. **Configure in Application**:
   ```bash
   SENTRY_DSN=https://xyz789@o123456.ingest.sentry.io/prod-id
   SENTRY_ENVIRONMENT=production
   SENTRY_TRACES_SAMPLE_RATE=0.1
   ```

### Alert Rules

#### 1. Critical Error Alert

**Trigger**: Any 500 error occurs

**Configuration**:
```yaml
name: Critical Error Alert
conditions:
  - event.level: error
  - event.tags.status_code: 500
actions:
  - slack: #alerts
  - email: team@yourdomain.com
frequency: Immediately
```

**Slack Message Format**:
```
🚨 CRITICAL ERROR - Production

Error: Internal Server Error
Status: 500
Path: /api/v1/orgs/123/debts
User: user@example.com
Organization: org-123

View in Sentry: [Link]
```

#### 2. High Error Rate Alert

**Trigger**: Error rate > 5% over 5 minutes

**Configuration**:
```yaml
name: High Error Rate
conditions:
  - error_rate > 5%
  - time_window: 5 minutes
actions:
  - slack: #alerts
  - email: team@yourdomain.com
frequency: Every 15 minutes
```

#### 3. Performance Degradation Alert

**Trigger**: P95 response time > 2 seconds

**Configuration**:
```yaml
name: Performance Degradation
conditions:
  - p95_response_time > 2000ms
  - time_window: 10 minutes
actions:
  - slack: #alerts
frequency: Every 30 minutes
```

#### 4. Database Error Alert

**Trigger**: Database connection errors

**Configuration**:
```yaml
name: Database Connection Error
conditions:
  - error.message contains "database"
  - error.message contains "connection"
actions:
  - slack: #alerts
  - email: team@yourdomain.com
  - pagerduty: on-call
frequency: Immediately
```

### Error Grouping

**Configure Fingerprinting**:

```typescript
// In Sentry initialization
Sentry.init({
  beforeSend(event) {
    // Group by error code
    if (event.tags?.error_code) {
      event.fingerprint = [event.tags.error_code];
    }
    
    // Group database errors
    if (event.exception?.values?.[0]?.value?.includes('database')) {
      event.fingerprint = ['database-error'];
    }
    
    return event;
  },
});
```

### Release Tracking

**Automatic Release Creation** (via GitHub Actions):

```yaml
- name: Create Sentry release
  uses: getsentry/action-release@v1
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
    SENTRY_PROJECT: debt-snowball-api
  with:
    environment: production
    version: ${{ github.sha }}
```

---

## Uptime Monitoring

### UptimeRobot Configuration

#### Staging Monitor

```yaml
Monitor Name: Debt Snowball API - Staging
Monitor Type: HTTP(s)
URL: https://api-staging.yourdomain.com/health
Monitoring Interval: 5 minutes
Monitor Timeout: 30 seconds
Alert Contacts:
  - Email: team@yourdomain.com
Alert When:
  - Down (2 consecutive failures)
  - Up (after being down)
Keyword Monitoring:
  - Keyword: "healthy"
  - Alert if not found: Yes
```

#### Production Monitor

```yaml
Monitor Name: Debt Snowball API - Production
Monitor Type: HTTP(s)
URL: https://api.yourdomain.com/health
Monitoring Interval: 1 minute
Monitor Timeout: 30 seconds
Alert Contacts:
  - Email: team@yourdomain.com
  - SMS: +44XXXXXXXXXX
  - Slack: #alerts
Alert When:
  - Down (2 consecutive failures)
  - Up (after being down)
  - SSL certificate expires (30 days before)
Keyword Monitoring:
  - Keyword: "healthy"
  - Alert if not found: Yes
```

### Status Page

**Create Public Status Page**:

1. Go to UptimeRobot → Status Pages
2. Create new status page
3. Add monitors:
   - API Health
   - Database Connection
   - Authentication Service
4. Customize:
   - Domain: `status.yourdomain.com`
   - Logo: Your logo
   - Custom message

**Status Page URL**: `https://status.yourdomain.com`

### Webhook Integration

**Configure Slack Webhook**:

```bash
# UptimeRobot → Alert Contacts → Add Alert Contact
Type: Webhook
URL: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
POST Value:
{
  "text": "*monitorFriendlyName* is *alertTypeFriendlyName*",
  "attachments": [
    {
      "color": "*alertTypeColor*",
      "fields": [
        {
          "title": "Monitor",
          "value": "*monitorURL*",
          "short": true
        },
        {
          "title": "Status",
          "value": "*alertTypeFriendlyName*",
          "short": true
        }
      ]
    }
  ]
}
```

---

## Database Monitoring

### Neon Monitoring

#### Connection Monitoring

**Alert Configuration**:

```yaml
Alert: High Connection Count
Condition: Active connections > 80% of limit
Threshold:
  - Staging: > 80 connections (of 100)
  - Production: > 400 connections (of 500)
Action: Email notification
Frequency: Every 15 minutes
```

#### Storage Monitoring

**Alert Configuration**:

```yaml
Alert: High Storage Usage
Condition: Storage > 80% of limit
Action: Email notification
Frequency: Daily
```

#### Query Performance

**Monitor Slow Queries**:

```sql
-- Create view for slow queries
CREATE VIEW slow_queries AS
SELECT
  query,
  mean_exec_time,
  calls,
  total_exec_time,
  min_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000  -- Queries taking > 1 second
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Query slow queries
SELECT * FROM slow_queries;
```

**Weekly Review**:
- Review slow queries every Monday
- Optimize queries taking > 1 second
- Add indexes where needed
- Update query patterns

### Custom Database Metrics

**Create Monitoring Endpoint**:

```typescript
// GET /admin/metrics/database
app.get('/admin/metrics/database', requireAdmin, async (c) => {
  const metrics = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM organizations) as total_orgs,
      (SELECT count(*) FROM users) as total_users,
      (SELECT count(*) FROM debts WHERE status = 'active') as active_debts,
      (SELECT count(*) FROM pg_stat_activity) as active_connections,
      (SELECT pg_database_size(current_database())) as database_size
  `);
  
  return c.json(metrics);
});
```

---

## Performance Monitoring

### Application Metrics

#### Response Time Tracking

**Middleware for Tracking**:

```typescript
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  
  // Log slow requests
  if (duration > 1000) {
    logger.warn({
      path: c.req.path,
      method: c.req.method,
      duration,
      userId: c.get('userId'),
    }, 'Slow request detected');
  }
  
  // Send to Sentry
  Sentry.metrics.distribution('http.request.duration', duration, {
    tags: {
      path: c.req.path,
      method: c.req.method,
      status: c.res.status,
    },
  });
});
```

#### Cache Hit Rate

**Track Cache Performance**:

```typescript
// Cache metrics
const cacheMetrics = {
  hits: 0,
  misses: 0,
  
  recordHit() {
    this.hits++;
  },
  
  recordMiss() {
    this.misses++;
  },
  
  getHitRate() {
    const total = this.hits + this.misses;
    return total > 0 ? (this.hits / total) * 100 : 0;
  },
};

// Expose metrics endpoint
app.get('/admin/metrics/cache', requireAdmin, (c) => {
  return c.json({
    hits: cacheMetrics.hits,
    misses: cacheMetrics.misses,
    hitRate: cacheMetrics.getHitRate(),
  });
});
```

### Business Metrics

**Track Key Metrics**:

```typescript
// GET /admin/metrics/business
app.get('/admin/metrics/business', requireAdmin, async (c) => {
  const metrics = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM organizations WHERE created_at > NOW() - INTERVAL '30 days') as new_orgs_30d,
      (SELECT count(*) FROM debts WHERE status = 'paid' AND updated_at > NOW() - INTERVAL '30 days') as debts_paid_30d,
      (SELECT avg(balance) FROM debts WHERE status = 'active') as avg_debt_balance,
      (SELECT count(*) FROM baby_steps WHERE current_step >= 3) as orgs_on_step_3_plus
  `);
  
  return c.json(metrics);
});
```

---

## Alert Configuration

### Alert Severity Levels

| Level | Response Time | Notification Channels | Example |
|-------|--------------|----------------------|---------|
| **Critical** | Immediate | Slack + Email + SMS | API down, database connection lost |
| **High** | 15 minutes | Slack + Email | High error rate, performance degradation |
| **Medium** | 1 hour | Slack | Slow queries, cache misses |
| **Low** | 24 hours | Email | Storage warning, dependency updates |

### Slack Alert Configuration

#### Create Slack Channels

1. **#alerts** - Critical and high priority alerts
2. **#deployments** - Deployment notifications
3. **#monitoring** - All monitoring events

#### Configure Webhooks

**Alerts Channel**:
```bash
# Create incoming webhook for #alerts
Webhook URL: https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX
```

**Deployments Channel**:
```bash
# Create incoming webhook for #deployments
Webhook URL: https://hooks.slack.com/services/T00000000/B00000001/YYYYYYYYYYYYYYYYYYYY
```

### Email Alert Configuration

**Alert Recipients**:

```yaml
Critical Alerts:
  - team@yourdomain.com
  - oncall@yourdomain.com

High Priority:
  - team@yourdomain.com

Medium Priority:
  - devops@yourdomain.com

Low Priority:
  - devops@yourdomain.com
```

### PagerDuty Integration (Optional)

**For 24/7 On-Call**:

1. Create PagerDuty service
2. Configure escalation policy
3. Integrate with Sentry
4. Set up on-call schedule

---

## Incident Response

### Incident Response Workflow

```
┌─────────────────┐
│ Alert Triggered │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Acknowledge    │
│  (< 5 minutes)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Investigate   │
│  (< 15 minutes) │
└────────┬────────┘
         │
         ├─────────────────┬─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Resolve   │   │  Escalate   │   │  Rollback   │
└─────────────┘   └─────────────┘   └─────────────┘
         │                 │                 │
         └─────────────────┴─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Post-Mortem    │
                  │  (within 48h)   │
                  └─────────────────┘
```

### Incident Severity

**P0 - Critical**:
- API completely down
- Database connection lost
- Data loss or corruption
- Security breach

**Response**: Immediate, all hands on deck

**P1 - High**:
- Partial service degradation
- High error rate (> 10%)
- Authentication failures
- Payment processing issues

**Response**: Within 15 minutes

**P2 - Medium**:
- Performance degradation
- Non-critical feature broken
- Elevated error rate (5-10%)

**Response**: Within 1 hour

**P3 - Low**:
- Minor bugs
- Documentation issues
- Non-urgent improvements

**Response**: Next business day

### Incident Communication

**Status Updates**:

1. **Initial Alert** (< 5 minutes):
   ```
   🚨 INCIDENT: API Downtime
   Status: Investigating
   Impact: All users affected
   Started: 2024-01-15 10:30 UTC
   ```

2. **Progress Update** (every 15 minutes):
   ```
   📊 UPDATE: API Downtime
   Status: Identified - Database connection issue
   Impact: All users affected
   ETA: 15 minutes
   ```

3. **Resolution** (when fixed):
   ```
   ✅ RESOLVED: API Downtime
   Status: Resolved
   Impact: Service restored
   Duration: 23 minutes
   Root Cause: Database connection pool exhausted
   ```

### Post-Mortem Template

```markdown
# Incident Post-Mortem

## Incident Summary
- **Date**: 2024-01-15
- **Duration**: 23 minutes
- **Severity**: P1 - High
- **Impact**: All users unable to access API

## Timeline
- 10:30 UTC: Alert triggered - API health check failing
- 10:32 UTC: Incident acknowledged
- 10:35 UTC: Investigation started
- 10:40 UTC: Root cause identified - database connection pool exhausted
- 10:45 UTC: Fix deployed - increased connection pool size
- 10:53 UTC: Service restored and verified

## Root Cause
Database connection pool was configured with max 100 connections. During peak traffic, all connections were exhausted, causing new requests to fail.

## Resolution
1. Increased connection pool size to 500
2. Enabled connection pooling in Neon
3. Added connection count monitoring

## Action Items
- [ ] Review and optimize database queries
- [ ] Implement connection pool monitoring
- [ ] Add load testing to CI/CD pipeline
- [ ] Document connection pool configuration

## Lessons Learned
- Need better capacity planning for database connections
- Should have connection pool alerts before exhaustion
- Load testing should include database connection limits
```

---

## Monitoring Checklist

### Daily Checks
- [ ] Review Sentry errors
- [ ] Check uptime status
- [ ] Review slow queries
- [ ] Check error rate trends

### Weekly Checks
- [ ] Review performance metrics
- [ ] Analyze slow queries
- [ ] Check cache hit rates
- [ ] Review security alerts
- [ ] Update dependencies

### Monthly Checks
- [ ] Review and optimize database indexes
- [ ] Analyze business metrics
- [ ] Review and update alerts
- [ ] Test backup restoration
- [ ] Security audit
- [ ] Capacity planning review

---

## Additional Resources

- [Sentry Documentation](https://docs.sentry.io/)
- [UptimeRobot API](https://uptimerobot.com/api/)
- [Neon Monitoring](https://neon.tech/docs/manage/monitoring)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [PagerDuty Integration](https://www.pagerduty.com/docs/)

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
