# Testing Database Setup Guide

Since you're using Neon PostgreSQL, you can use their **branching feature** to create an isolated test database. This is the easiest and recommended approach.

## Option 1: Neon Branch (Recommended - Easiest!)

### Step 1: Create a Test Branch in Neon Dashboard

1. Go to your Neon dashboard: https://console.neon.tech
2. Select your project (the one with your current database)
3. Click on **"Branches"** in the left sidebar
4. Click **"Create Branch"** button
5. Configure the branch:
   - **Branch name**: `test` (or `testing`)
   - **Parent branch**: Select your main branch (usually `main`)
   - **Compute**: You can use the smallest compute size for testing
6. Click **"Create Branch"**

### Step 2: Get the Test Branch Connection String

1. After creating the branch, click on it in the branches list
2. Click on **"Connection Details"** or the connection string icon
3. Copy the connection string (it will look similar to your main one but with a different endpoint)
4. It should look like: `postgresql://neondb_owner:npg_xxx@ep-xxx-xxx.eu-west-2.aws.neon.tech/neondb?sslmode=require`

### Step 3: Create .env.test.local

Copy `.env.test` to `.env.test.local` and update with your test branch connection string:

```bash
# Copy the template (PowerShell)
Copy-Item .env.test .env.test.local

# Or on Unix/Mac
cp .env.test .env.test.local
```

Then edit `.env.test.local` and update the `DATABASE_URL`:

```bash
# Test Database URL - Neon test branch
DATABASE_URL='postgresql://neondb_owner:npg_xxx@ep-test-branch-xxx.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

# Keep the rest as is
BETTER_AUTH_SECRET=test-secret-do-not-use-in-production
BETTER_AUTH_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
PORT=3001
NODE_ENV=test
LOG_LEVEL=error
```

**Important:** `.env.test.local` is in `.gitignore` so your credentials won't be committed to git. `.env.test` is just a template.

### Step 4: Run Migrations on Test Branch

Now apply your database schema to the test branch using the automated script:

```bash
bun run db:push:test
```

This script automatically:
- Reads the `DATABASE_URL` from `.env.test.local` (or `.env.test` as fallback)
- Validates it's not a placeholder
- Pushes your schema to the test database
- Reports success or errors

**Alternative (manual):**
```bash
# Temporarily set the DATABASE_URL to your test branch
$env:DATABASE_URL='<your-test-branch-connection-string>'
bun run db:push
```

### Step 5: Run Tests

```bash
# Run all tests
bun test

# Run specific test
bun test src/services/audit.service.test.ts
```

---

## Option 2: Local PostgreSQL (Alternative)

If you prefer a local test database instead:

### Step 1: Install PostgreSQL Locally

If you don't have PostgreSQL installed:
- **Windows**: Download from https://www.postgresql.org/download/windows/
- Or use Docker: `docker run --name postgres-test -e POSTGRES_PASSWORD=test -p 5433:5432 -d postgres`

### Step 2: Create Test Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create test database
CREATE DATABASE debt_snowball_test;

# Create user (optional)
CREATE USER test_user WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE debt_snowball_test TO test_user;

# Exit
\q
```

### Step 3: Create .env.test.local

Copy `.env.test` to `.env.test.local` and update with your local database URL:

```bash
# Copy the template
Copy-Item .env.test .env.test.local

# Edit .env.test.local
DATABASE_URL='postgresql://test_user:test_password@localhost:5432/debt_snowball_test'
```

### Step 4: Run Migrations

```bash
$env:DATABASE_URL='postgresql://test_user:test_password@localhost:5432/debt_snowball_test'
bun run db:push
```

### Step 5: Run Tests

```bash
bun test
```

---

## Quick Setup Script (PowerShell)

Here's a quick script to set up and test:

```powershell
# Save your test database URL
$TEST_DB_URL = "postgresql://neondb_owner:npg_xxx@ep-test-xxx.eu-west-2.aws.neon.tech/neondb?sslmode=require"

# Run migrations on test database
$env:DATABASE_URL = $TEST_DB_URL
bun run db:push

# Run tests
bun test src/services/audit.service.test.ts
```

---

## Benefits of Neon Branching

✅ **Isolated**: Test data never touches your development database  
✅ **Fast**: Branches are created instantly  
✅ **Free**: Included in Neon's free tier  
✅ **Easy cleanup**: Delete the branch when done  
✅ **Realistic**: Same database engine as production  

## Troubleshooting

### Tests fail with "DATABASE_URL must be set"

Make sure `.env.test.local` exists and has a valid `DATABASE_URL`. Copy from `.env.test` if needed.

### Tests fail with "relation does not exist"

Run migrations on your test database:
```bash
$env:DATABASE_URL='<test-db-url>'
bun run db:push
```

### Foreign key constraint errors

The test database needs the same schema as your development database. Run migrations again.

### Connection refused

- For Neon: Check that your test branch is active (not paused)
- For local: Make sure PostgreSQL is running

## Next Steps

Once your test database is set up, you can run:

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run with coverage
bun test --coverage
```
