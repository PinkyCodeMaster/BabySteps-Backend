# Debt Snowball API

A backend system for managing family finances using the debt snowball method and Dave Ramsey's Baby Steps framework.

## Technology Stack

- **Runtime**: Bun
- **Web Framework**: Hono
- **Database**: Neon Postgres (serverless PostgreSQL)
- **ORM**: Drizzle
- **Authentication**: Better Auth with organization plugin
- **Validation**: Zod schemas
- **API Documentation**: @hono/zod-openapi

## Prerequisites

- [Bun](https://bun.sh/) v1.0.0 or higher
- PostgreSQL database (Neon recommended)

## Getting Started

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment Variables

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

Edit `.env` and configure:
- `DATABASE_URL`: Your Neon Postgres connection string
- `BETTER_AUTH_SECRET`: A secure random string for session encryption (min 32 characters)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

**For detailed environment variable documentation, see [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)**

### 3. Run Database Migrations

```bash
bun run db:push  # For local development
```

### 4. Start Development Server

```bash
bun run dev
```

The API will be available at `http://localhost:9000`

## Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run start` - Start production server
- `bun run db:generate` - Generate migration files from schema changes
- `bun run db:push` - Push schema changes directly to database (dev only)
- `bun run db:verify` - Verify database schema matches expected structure
- `bun run lint` - Run ESLint
- `bun run lint:fix` - Fix ESLint errors automatically
- `bun run test` - Run tests
- `bun run test:watch` - Run tests in watch mode
- `bun run test:coverage` - Run tests with coverage report

## API Documentation

Once the server is running, visit:
- OpenAPI UI: `http://localhost:9000/docs`
- OpenAPI JSON: `http://localhost:9000/openapi.json`
- Health Check: `http://localhost:9000/health`

## Project Structure

```
src/
├── app.ts              # Hono application setup
├── server.ts           # Bun server entry point
├── db/                 # Database configuration and schemas
├── middleware/         # Custom middleware (auth, CORS, rate limiting, etc.)
├── routers/            # API route handlers
├── services/           # Business logic services
├── utils/              # Utility functions
└── types/              # TypeScript type definitions
```

## Development Workflow

1. Make changes to schema files in `src/db/schema/`
2. Generate migration: `bun run db:generate`
3. Review generated SQL in `drizzle/` directory
4. Apply migration: `bun run db:push` (dev) or deploy to staging
5. Implement business logic in services
6. Create API routes in routers
7. Write tests (unit and property-based)
8. Run tests: `bun run test`

**For deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)**

## Testing

The project uses two types of tests:

### Unit Tests
Test specific examples and edge cases:
```bash
bun test
```

### Property-Based Tests
Verify universal properties across random inputs using fast-check:
```bash
bun test --grep "property"
```

## Security

- All passwords are hashed using Better Auth
- Session tokens are secure, httpOnly cookies
- CORS is enforced with whitelist
- All queries are organization-scoped
- Rate limiting on sensitive endpoints
- Input validation with Zod schemas
- Error sanitization (no sensitive data in responses)

## Documentation

- [Environment Variables](./ENVIRONMENT_VARIABLES.md) - Complete guide to all environment variables
- [Deployment Guide](./DEPLOYMENT.md) - Step-by-step deployment instructions for staging and production
- [Setup Guide](./SETUP.md) - Initial project setup documentation
- [Testing Guide](./TESTING_SETUP.md) - Testing infrastructure and guidelines
- [Logging Guide](./LOGGING_SETUP.md) - Logging configuration and best practices

## License

MIT
