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
- `BETTER_AUTH_SECRET`: A secure random string for session encryption
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

### 3. Run Database Migrations

```bash
bun run migrate
```

### 4. Start Development Server

```bash
bun run dev
```

The API will be available at `http://localhost:3000`

## Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run start` - Start production server
- `bun run migrate:generate` - Generate migration files from schema changes
- `bun run migrate:push` - Push schema changes directly to database (dev only)
- `bun run migrate` - Apply pending migrations
- `bun run lint` - Run ESLint
- `bun run lint:fix` - Fix ESLint errors automatically
- `bun run test` - Run tests
- `bun run test:watch` - Run tests in watch mode
- `bun run test:coverage` - Run tests with coverage report

## API Documentation

Once the server is running, visit:
- OpenAPI UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`
- Health Check: `http://localhost:3000/health`

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
2. Generate migration: `bun run migrate:generate`
3. Review generated SQL in `drizzle/` directory
4. Apply migration: `bun run migrate`
5. Implement business logic in services
6. Create API routes in routers
7. Write tests (unit and property-based)
8. Run tests: `bun run test`

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

## License

MIT
