# Migration Approach - Using drizzle-kit

## Overview

The Debt Snowball API uses `drizzle-kit` for database migrations in both development and production environments.

## Why drizzle-kit in Production?

We've moved `drizzle-kit` from devDependencies to dependencies so it's available in production Docker containers. This provides:

✅ **Consistency**: Same migration tool in dev and prod  
✅ **Simplicity**: No custom migration scripts needed  
✅ **Official Support**: Uses Drizzle's official migration command  
✅ **Reliability**: Battle-tested by the Drizzle community  

## Migration Workflow

### Development

**1. Make Schema Changes**

Edit schema files in `src/db/schema/`:
```typescript
// Example: src/db/schema/debts.ts
export const debts = pgTable('debts', {
  // ... existing fields
  notes: text('notes'), // New field
});
```

**2. Generate Migration**

```bash
bun run db:generate
```

This creates migration files in `drizzle/`:
```
drizzle/
├── 0000_big_timeslip.sql
├── 0001_add_notes_field.sql  # New migration
└── meta/
    ├── _journal.json
    └── 0001_snapshot.json
```

**3. Review Generated SQL**

```bash
cat drizzle/0001_add_notes_field.sql
```

**4. Apply Migration**

For development, you can use either:

```bash
# Option 1: Direct push (faster, no migration files)
bun run db:push

# Option 2: Apply migrations (recommended for testing prod workflow)
bun run db:migrate
```

**5. Commit Migration Files**

```bash
git add drizzle/
git commit -m "feat: add notes field to debts table"
git push
```

### Production

**1. Migrations Included in Docker Image**

When building the Docker image, migration files are automatically included:
```dockerfile
COPY . .  # Includes drizzle/ directory
```

**2. Migrations Run on Container Startup**

The container runs migrations before starting the application:
```bash
bun run db:migrate && bun run start
```

**3. drizzle-kit migrate Behavior**

The `drizzle-kit migrate` command:
- ✅ Reads migrations from `drizzle/` folder
- ✅ Checks which migrations have been applied
- ✅ Applies only new migrations
- ✅ Updates migration tracking table
- ✅ Exits with appropriate status code

## Package Configuration

### package.json

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "drizzle-kit": "^0.31.7",
    "drizzle-orm": "^0.44.7"
  }
}
```

**Note**: `drizzle-kit` is in `dependencies` (not `devDependencies`) so it's available in production.

### drizzle.config.ts

```typescript
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

## Deployment

### Railway

Railway automatically runs the start command which includes migrations:

**railway.json**:
```json
{
  "deploy": {
    "startCommand": "bun run db:migrate && bun run start"
  }
}
```

### Render

**render.yaml**:
```yaml
services:
  - type: web
    name: debt-snowball-api
    startCommand: bun run db:migrate && bun run start
```

### Fly.io

**fly.toml**:
```toml
[processes]
  app = "bun run db:migrate && bun run start"
```

### Docker

**Dockerfile CMD**:
```dockerfile
CMD ["sh", "-c", "bun run db:migrate && bun run start"]
```

Or override at runtime:
```bash
docker run myapp sh -c "bun run db:migrate && bun run start"
```

## Migration Commands

### Development Commands

```bash
# Generate migration from schema changes
bun run db:generate

# Push schema directly (dev only - no migration files)
bun run db:push

# Apply migrations (same as production)
bun run db:migrate

# Verify database schema
bun run db:verify
```

### Production Commands

```bash
# Apply migrations (runs automatically on startup)
bun run db:migrate

# Manual migration (if needed)
railway run bun run db:migrate  # Railway
fly ssh console -C "bun run db:migrate"  # Fly.io
docker exec <container> bun run db:migrate  # Docker
```

## Migration File Structure

```
drizzle/
├── 0000_initial_schema.sql
├── 0001_add_notes_field.sql
├── 0002_add_indexes.sql
└── meta/
    ├── _journal.json          # Tracks applied migrations
    ├── 0000_snapshot.json
    ├── 0001_snapshot.json
    └── 0002_snapshot.json
```

## Best Practices

### 1. Always Generate Migrations Before Deploying

```bash
bun run db:generate
git add drizzle/
git commit -m "chore: add database migrations"
```

### 2. Test Migrations in Staging

```bash
git push origin staging
# Verify migrations applied successfully
```

### 3. Review Migration SQL

```bash
cat drizzle/XXXX_migration_name.sql
```

Check for:
- Correct table/column names
- No unintended DROP statements
- Proper data types
- Appropriate indexes

### 4. Backup Before Major Migrations

Neon provides automatic backups, but verify:
1. Backup exists in Neon console
2. Test migration in staging
3. Have rollback plan ready

## Troubleshooting

### Migration Fails: "already exists"

**Cause**: Trying to create something that already exists

**Solution**: This usually means migrations are out of sync. Check:
```bash
# View migration history in database
SELECT * FROM drizzle.__drizzle_migrations;
```

### Migration Hangs

**Cause**: Waiting for user input or database lock

**Solution**:
- Check database connections
- Ensure no long-running transactions
- Check for table locks

### drizzle-kit Not Found in Production

**Cause**: Old deployment with drizzle-kit in devDependencies

**Solution**: 
1. Ensure latest code is deployed
2. Verify `drizzle-kit` is in `dependencies` in package.json
3. Rebuild Docker image

## Comparison: drizzle-kit vs Custom Script

| Feature | drizzle-kit migrate | Custom Script |
|---------|-------------------|---------------|
| **Simplicity** | ✅ Simple | ⚠️ More complex |
| **Official Support** | ✅ Yes | ❌ No |
| **Maintenance** | ✅ Maintained by Drizzle | ⚠️ We maintain |
| **Features** | ✅ Full featured | ⚠️ Basic |
| **Package Size** | ⚠️ Larger | ✅ Smaller |
| **Consistency** | ✅ Same tool everywhere | ✅ Same tool everywhere |

**Decision**: We use `drizzle-kit migrate` for simplicity and official support.

## Related Documentation

- [Drizzle Kit Documentation](https://orm.drizzle.team/kit-docs/overview)
- [Neon + Drizzle Guide](https://neon.tech/docs/guides/drizzle)
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide
- [DOCKER_BUILD_NOTES.md](./DOCKER_BUILD_NOTES.md) - Docker guide

---

**Last Updated**: 2024-12-03  
**Version**: 2.0.0 (Using drizzle-kit)
