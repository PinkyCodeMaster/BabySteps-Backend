# Deployment Guide

## Prerequisites

- Neon Postgres database (staging + production)
- Railway/Render/Fly.io account
- GitHub repository connected

## Environment Setup

### Required Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host.neon.tech/db?sslmode=require
BETTER_AUTH_SECRET=<generate-with-openssl-rand-base64-32>
BETTER_AUTH_URL=https://your-app-url.com
ALLOWED_ORIGINS=https://your-frontend.com
NODE_ENV=production
```

### Optional Variables

```env
SENTRY_DSN=https://...@sentry.io/...
REDIS_URL=redis://...
LOG_LEVEL=info
```

## Railway Deployment (Recommended)

### 1. Create Neon Database

1. Go to [Neon Console](https://console.neon.tech)
2. Create new project
3. Copy connection string (use "Pooled connection")

### 2. Deploy to Railway

1. **Connect Repository**:
   - Go to [Railway](https://railway.app)
   - New Project → Deploy from GitHub
   - Select your repository

2. **Add Database** (or use external Neon):
   - Add PostgreSQL service (optional)
   - Or use your Neon connection string

3. **Set Environment Variables**:
   ```
   DATABASE_URL=<your-neon-connection-string>
   BETTER_AUTH_SECRET=<generate-new-secret>
   BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
   ALLOWED_ORIGINS=https://your-frontend.com
   NODE_ENV=production
   ```

4. **Deploy**:
   - Railway auto-deploys on push to main
   - Migrations run automatically on startup

### 3. Verify Deployment

```bash
# Check health
curl https://your-app.railway.app/health

# Expected response:
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "..."
}
```

## Render Deployment

### 1. Create Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. New → Web Service
3. Connect your GitHub repository

### 2. Configure Service

**Settings**:
- **Name**: debt-snowball-api
- **Environment**: Node
- **Build Command**: `bun install`
- **Start Command**: `bun run db:migrate && bun run start`

**Environment Variables**:
Add all required variables from above

### 3. Deploy

Render auto-deploys on push to main branch.

## Fly.io Deployment

### 1. Install Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Launch App

```bash
fly launch
```

Follow prompts to configure.

### 3. Set Secrets

```bash
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set BETTER_AUTH_SECRET="..."
fly secrets set BETTER_AUTH_URL="https://your-app.fly.dev"
fly secrets set ALLOWED_ORIGINS="https://your-frontend.com"
```

### 4. Deploy

```bash
fly deploy
```

## Docker Deployment

### Build Image

```bash
docker build -t debt-snowball-api .
```

### Run Container

```bash
docker run -d \
  -p 9000:9000 \
  -e DATABASE_URL="postgresql://..." \
  -e BETTER_AUTH_SECRET="..." \
  -e BETTER_AUTH_URL="http://localhost:9000" \
  -e ALLOWED_ORIGINS="http://localhost:3000" \
  --name debt-snowball-api \
  debt-snowball-api
```

## Database Migrations

### Automatic (Recommended)

Migrations run automatically on container startup:
```bash
bun run db:migrate && bun run start
```

### Manual

```bash
# Railway
railway run bun run db:migrate

# Fly.io
fly ssh console -C "bun run db:migrate"

# Docker
docker exec <container> bun run db:migrate
```

## Monitoring

### Health Check

```bash
curl https://your-app.com/health
```

### Logs

```bash
# Railway
railway logs

# Render
# View in dashboard

# Fly.io
fly logs

# Docker
docker logs <container>
```

### Error Tracking

Configure Sentry for error tracking:
1. Create Sentry project
2. Add `SENTRY_DSN` to environment variables
3. Errors automatically reported

## Troubleshooting

### Build Fails: "lockfile had changes"

```bash
bun install
git add bun.lock
git commit -m "chore: update lockfile"
git push
```

### Migration Fails

```bash
# Check migration files exist
ls drizzle/

# Generate if missing
bun run db:generate
git add drizzle/
git commit -m "chore: add migrations"
git push
```

### Database Connection Fails

- Verify `DATABASE_URL` is correct
- Ensure database is accessible from deployment platform
- Check for IP whitelist restrictions
- Use pooled connection string for Neon

### Application Won't Start

- Check logs for errors
- Verify all required environment variables are set
- Ensure migrations completed successfully
- Check database connection

## Staging vs Production

### Staging

- Use separate Neon database
- Deploy from `staging` branch
- Test all changes before production
- Use staging-specific environment variables

### Production

- Use production Neon database
- Deploy from `main` branch
- Different `BETTER_AUTH_SECRET`
- Production domain in `ALLOWED_ORIGINS`

## Rollback

### Railway

```bash
railway deployments
railway rollback <deployment-id>
```

### Render

Use dashboard to rollback to previous deployment.

### Fly.io

```bash
fly releases
fly releases rollback <version>
```

## Security Checklist

- [ ] `BETTER_AUTH_SECRET` is cryptographically random
- [ ] Different secrets for staging/production
- [ ] HTTPS enabled
- [ ] CORS restricted to known domains
- [ ] Database uses SSL (`?sslmode=require`)
- [ ] Environment variables not in git
- [ ] Sentry configured (no sensitive data in errors)
- [ ] Rate limiting enabled

## Performance

### Caching

Add Redis for caching expensive calculations:

```env
REDIS_URL=redis://...
```

Caches:
- Snowball calculations (5 min TTL)
- Debt-free date projections (5 min TTL)
- Disposable income (5 min TTL)

### Database

- Neon provides automatic connection pooling
- Use pooled connection string
- Monitor slow queries in Neon console

## Support

- **Logs**: Check application logs first
- **Health**: Monitor `/health` endpoint
- **Errors**: Check Sentry dashboard
- **Database**: Check Neon console

---

**Need help?** Check the [README.md](./README.md) for development setup and troubleshooting.
