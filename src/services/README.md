# Services

This directory contains business logic services for the Debt Snowball API.

## Services

### Audit Service (`audit.service.ts`)

Provides functionality for logging sensitive operations to the audit log. All logged actions include:
- userId
- organizationId
- action type
- affected record IDs
- metadata
- timestamp (automatically added)

**Usage:**
```typescript
import { auditService } from './services/audit.service';

await auditService.log({
  userId: 'user-123',
  organizationId: 'org-456',
  action: 'PAYMENT_RECORDED',
  affectedRecordIds: ['debt-789'],
  metadata: { 
    amount: 100.00, 
    previousBalance: 1000.00, 
    newBalance: 900.00 
  }
});
```

**Common Actions:**
- `USER_INVITED`
- `MEMBERSHIP_ACTIVATED`
- `ROLE_CHANGED`
- `DEBT_MARKED_PAID`
- `DEBT_STATUS_CHANGED`
- `ORGANIZATION_CREATED`
- `PAYMENT_RECORDED`
- `DATA_EXPORTED`

## Testing

### Test Database Setup

**Important:** Tests require a separate test database to avoid polluting your development data.

#### Step 1: Choose Your Test Database Approach

**Option A: Separate Neon Branch (Recommended for Neon users)**

Neon supports database branching, which is perfect for testing:

1. Create a test branch in your Neon project:
   ```bash
   # Using Neon CLI
   neon branches create --name test
   ```

2. Get the connection string for your test branch from the Neon dashboard

**Option B: Separate Local Test Database**

If you're using a local PostgreSQL instance:

1. Create a separate test database:
   ```sql
   CREATE DATABASE debt_snowball_test;
   ```

#### Step 2: Configure .env.test

1. Copy the provided `.env.test` file in the project root
2. Update the `DATABASE_URL` with your test database connection string:
   ```bash
   # For Neon test branch
   DATABASE_URL=postgresql://user:pass@test-branch.neon.tech/neondb
   
   # OR for local test database
   DATABASE_URL=postgresql://user:pass@localhost:5432/debt_snowball_test
   ```

#### Step 3: Run Migrations on Test Database

```bash
# Load .env.test and run migrations
bun run db:push
```

Note: Bun will automatically load `.env.test` when `NODE_ENV=test` or you can manually specify it.

### Running Tests

```bash
# Run all tests (automatically uses .env.test if present)
bun test

# Run specific service tests
bun test src/services/audit.service.test.ts

# Run tests in watch mode
bun test --watch

# Run with explicit test environment
NODE_ENV=test bun test
```

### Test Best Practices

1. **Always use a separate test database** - Never run tests against your development or production database
2. **Clean up test data** - Tests should clean up after themselves (see `beforeEach` and `afterAll` hooks)
3. **Use transactions** - Consider wrapping tests in transactions that rollback for faster cleanup
4. **Isolate tests** - Each test should be independent and not rely on other tests

### CI/CD Testing

For CI/CD pipelines, you can:
1. Use Neon's ephemeral branches (created and destroyed per test run)
2. Use a dedicated CI test database
3. Use Docker containers with PostgreSQL for isolated test environments

Example GitHub Actions setup:
```yaml
- name: Run tests
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
  run: bun test
```
