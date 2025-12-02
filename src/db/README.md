# Database Setup and Schema

This directory contains the database configuration, schema definitions, and migration management for the Debt Snowball API.

## Overview

- **ORM**: Drizzle ORM
- **Database**: Neon Postgres (serverless PostgreSQL)
- **Migration Tool**: drizzle-kit

## Schema Structure

### Tables (13 total)

#### Authentication & Authorization (Better Auth)
- `user` - User accounts with email and authentication details
- `session` - Active user sessions with tokens
- `account` - OAuth and credential provider accounts
- `verification` - Email verification tokens
- `organization` - Family/organization entities
- `member` - User-organization memberships with roles
- `invitation` - Pending organization invitations

#### Financial Data
- `income` - Income sources with frequency and amounts
- `expense` - Expenses with categories, priorities, and UC payment status
- `debt` - Debts with balances, interest rates, and snowball positions
- `baby_step` - Baby Steps progress tracking per organization
- `uc_config` - Universal Credit taper configuration

#### System
- `audit_log` - Audit trail for sensitive operations

### Enums (5 total)
- `frequency` - one-time, weekly, fortnightly, monthly, annual
- `expense_category` - housing, utilities, food, transport, insurance, childcare, other
- `expense_priority` - essential, important, discretionary
- `debt_status` - active, paid
- `debt_type` - credit-card, loan, overdraft, ccj, other

## Database Scripts

### Generate Migrations
```bash
bun run db:generate
```
Generates SQL migration files from schema changes in `src/db/schema/`.

### Apply Migrations
```bash
bun run db:push
```
Pushes schema changes directly to the database (development workflow).

### Verify Schema
```bash
bun run db:verify
```
Runs verification script to ensure all tables, enums, foreign keys, and indexes exist.

## Migration Files

Migrations are stored in the `drizzle/` directory:
- `drizzle/0000_big_timeslip.sql` - Initial schema migration
- `drizzle/meta/_journal.json` - Migration tracking journal

## Schema Files

Schema definitions are in `src/db/schema/`:
- `users.ts` - Better Auth tables (user, session, account, verification, organization, member, invitation)
- `incomes.ts` - Income tracking
- `expenses.ts` - Expense tracking
- `debts.ts` - Debt management
- `babySteps.ts` - Baby Steps progress
- `auditLogs.ts` - Audit logging
- `ucConfig.ts` - Universal Credit configuration
- `index.ts` - Schema exports

## Database Connection

The database connection is configured in `src/db/index.ts`:
- Uses Neon HTTP client for serverless PostgreSQL
- Exports `db` instance for queries
- Provides `checkDatabaseConnection()` health check function

## Environment Configuration

Required environment variable:
```
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

## Verification Results

Current schema status:
- ✅ 13/13 tables created
- ✅ 5/5 enums created
- ✅ 12 foreign key constraints
- ✅ 32 indexes for performance

## Key Features

### Organization-Scoped Data
All financial data (income, expense, debt, baby_step) is scoped to organizations with foreign key constraints and cascade deletes.

### Audit Trail
The `audit_log` table tracks all sensitive operations with:
- User ID and organization ID
- Action type
- Affected record IDs
- Metadata (JSON)
- Timestamp

### Indexes
Strategic indexes on:
- Organization IDs (for data isolation queries)
- User IDs (for user-specific queries)
- Status fields (for filtering)
- Timestamps (for audit log queries)
- Email addresses (for invitation lookups)

### Data Integrity
- Foreign key constraints with cascade deletes
- Unique constraints on emails, slugs, and tokens
- NOT NULL constraints on required fields
- Default values for status fields
- Numeric precision for money (12,2) and interest rates (5,2)

## Testing

Run database tests:
```bash
bun test src/db/index.test.ts
```

Tests verify:
- Database connection functionality
- Health check function
- DB instance export
