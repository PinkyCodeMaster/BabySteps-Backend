# Debt Snowball API

A backend system for managing family finances using the debt snowball method and Dave Ramsey's Baby Steps framework.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Database**: Neon Postgres (serverless)
- **ORM**: Drizzle
- **Auth**: Better Auth with organization plugin
- **Validation**: Zod
- **API Docs**: OpenAPI with Scalar UI

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.0.0+
- Neon Postgres database

### 1. Install Dependencies

```bash
bun install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Required Environment Variables:**

```env
# Database
DATABASE_URL=postgresql://user:pass@host.neon.tech/db?sslmode=require

# Authentication (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=your-secret-min-32-chars
BETTER_AUTH_URL=http://localhost:9000

# CORS (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000

# Server
PORT=9000
NODE_ENV=development

# Optional: Error Tracking
SENTRY_DSN=https://...@sentry.io/...

# Optional: Caching
REDIS_URL=redis://localhost:6379
```

### 3. Database Setup

```bash
# Generate migration files from schema
bun run db:generate

# Apply migrations
bun run db:migrate

# Or for development, push schema directly
bun run db:push
```

### 4. Start Development Server

```bash
bun run dev
```

API available at `http://localhost:9000`

## Available Scripts

```bash
# Development
bun run dev          # Start with hot reload

# Database
bun run db:generate  # Generate migrations
bun run db:migrate   # Apply migrations
bun run db:push      # Push schema (dev only)

# Testing
bun test             # Run all tests
bun test --watch     # Watch mode
bun test --coverage  # With coverage

# Production
bun run build        # Build for production
bun run start        # Start production server

# Code Quality
bun run lint         # Run ESLint
bun run lint:fix     # Fix ESLint errors
```

## API Documentation

Once running, visit:
- **API Docs**: http://localhost:9000/docs
- **OpenAPI JSON**: http://localhost:9000/openapi.json
- **Health Check**: http://localhost:9000/health

## Project Structure

```
src/
├── app.ts              # Hono app setup
├── server.ts           # Bun server entry
├── db/
│   ├── schema/         # Database schemas
│   └── index.ts        # DB connection
├── middleware/         # Auth, CORS, rate limiting, etc.
├── routes/             # API route handlers
├── services/           # Business logic
├── utils/              # Helper functions
└── __tests__/          # Test files
```

## Database Schema

The API manages:
- **Organizations** - Family units
- **Users** - Family members
- **Memberships** - User-organization relationships with roles
- **Incomes** - Income sources with frequency
- **Expenses** - Expenses with categories and priorities
- **Debts** - Debts with snowball ordering
- **Baby Steps** - Progress tracking
- **Audit Logs** - Activity tracking

## Key Features

### Authentication & Authorization
- Session-based auth with Better Auth
- Organization-scoped data access
- Role-based permissions (admin, member, viewer)

### Financial Management
- Income/expense tracking with frequency normalization
- Debt management with snowball method
- CCJ (County Court Judgment) debt prioritization
- Universal Credit taper calculations
- Baby Steps progress tracking

### Security
- CORS with domain whitelist
- Rate limiting (tiered by endpoint)
- Input validation with Zod
- Error sanitization
- Audit logging for sensitive operations

### API Features
- OpenAPI documentation
- Type-safe request/response validation
- Pagination and filtering
- Comprehensive error handling

## Testing

The project uses property-based testing with fast-check:

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/services/debt.service.test.ts

# Run with coverage
bun test --coverage
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy to Railway

1. **Prepare**:
```bash
# Ensure migrations are generated
bun run db:generate
git add drizzle/
git commit -m "chore: add migrations"
```

2. **Deploy**:
```bash
git push origin main
```

3. **Configure Environment Variables** in Railway dashboard:
- `DATABASE_URL` - Your Neon Postgres connection string
- `BETTER_AUTH_SECRET` - Random 32+ character string
- `BETTER_AUTH_URL` - Your Railway app URL
- `ALLOWED_ORIGINS` - Your frontend URL

Railway will automatically:
- Build the application
- Run migrations on startup
- Start the server

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | Neon Postgres connection string | `postgresql://...` |
| `BETTER_AUTH_SECRET` | Yes | Auth encryption key (32+ chars) | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Yes | API base URL | `https://api.yourdomain.com` |
| `ALLOWED_ORIGINS` | Yes | CORS allowed origins (comma-separated) | `https://yourdomain.com` |
| `PORT` | No | Server port (default: 9000) | `9000` |
| `NODE_ENV` | No | Environment (default: development) | `production` |
| `SENTRY_DSN` | No | Sentry error tracking | `https://...@sentry.io/...` |
| `REDIS_URL` | No | Redis for caching | `redis://localhost:6379` |

## Development Workflow

1. **Make schema changes** in `src/db/schema/`
2. **Generate migration**: `bun run db:generate`
3. **Review SQL** in `drizzle/` folder
4. **Apply migration**: `bun run db:migrate`
5. **Implement business logic** in services
6. **Create API routes** in routes
7. **Write tests** (unit + property-based)
8. **Run tests**: `bun test`
9. **Commit and push**

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
bun run db:verify

# Check DATABASE_URL format
echo $DATABASE_URL
```

### Migration Issues

```bash
# Reset local database (dev only)
bun run db:push

# Check migration status
bun run db:migrate
```

### Build Issues

```bash
# Clean and reinstall
rm -rf node_modules bun.lock
bun install

# Rebuild
bun run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Ensure tests pass: `bun test`
6. Submit a pull request

## License

MIT

## Support

For issues or questions:
- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment help
- Review API docs at `/docs` endpoint
- Check application logs for errors
