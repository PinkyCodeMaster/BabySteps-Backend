# Scripts

Utility scripts for database management and testing.

## Database Scripts

### `db-push-test.ts`

Pushes database schema to the test database specified in `.env.test.local` (or `.env.test` as fallback).

**Usage:**
```bash
bun run db:push:test
# or
bun run test:setup
```

**What it does:**
1. Reads `DATABASE_URL` from `.env.test.local` (or `.env.test` if not found)
2. Validates the URL is not a placeholder
3. Runs `drizzle-kit push` with the test database URL
4. Reports success or failure

**Example output:**
```
🔧 Pushing schema to test database...
📍 Database: ep-test-branch-xxx.eu-west-2.aws.neon.tech/neondb
✅ Schema successfully pushed to test database!
🧪 You can now run tests with: bun test
```

### `load-test-env.ts`

Loads environment variables from `.env.test.local` (or `.env.test` as fallback) for testing.

**Usage:**
```typescript
// Import at the top of test files
import '../../scripts/load-test-env';
```

**What it does:**
1. Reads `.env.test.local` file (or `.env.test` if not found)
2. Parses environment variables
3. Sets them in `process.env` (only if not already set)
4. Logs confirmation

This ensures tests always use the test database configuration. Priority: `.env.test.local` > `.env.test`

### `verify-schema.ts`

Verifies the database schema matches the expected structure.

**Usage:**
```bash
bun run db:verify
```

## Testing Workflow

### Initial Setup (One Time)

1. Create a test branch in Neon (or local test database)
2. Copy `.env.test` to `.env.test.local`
3. Update `.env.test.local` with test database URL
4. Push schema to test database:
   ```bash
   bun run db:push:test
   ```

### Daily Development

```bash
# Make schema changes in src/db/schema/

# Push to development database
bun run db:push

# Push to test database
bun run db:push:test

# Run tests
bun test
```

### When Schema Changes

After modifying database schemas:

```bash
# 1. Push to dev database
bun run db:push

# 2. Push to test database
bun run db:push:test

# 3. Run tests to verify
bun test
```

## Troubleshooting

### "DATABASE_URL not found in .env.test.local"

Create `.env.test.local` from the template and add your test database URL:
```bash
# Copy template
Copy-Item .env.test .env.test.local

# Edit .env.test.local
DATABASE_URL='postgresql://...'
```

### "You are using the placeholder test database URL"

Replace the placeholder in `.env.test.local` with your actual test database URL from Neon.

### Tests fail with "relation does not exist"

Your test database schema is out of sync. Run:
```bash
bun run db:push:test
```

### "Failed to push schema to test database"

Check that:
1. Your test database URL in `.env.test` is correct
2. The test database is accessible (not paused in Neon)
3. You have network connectivity

## CI/CD Integration

For GitHub Actions or other CI/CD:

```yaml
- name: Setup test database
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
  run: bun run db:push

- name: Run tests
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
  run: bun test
```

Store your test database URL as a secret in your CI/CD platform.
