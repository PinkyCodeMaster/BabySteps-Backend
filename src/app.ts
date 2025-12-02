import { Hono } from 'hono';
import healthRouter from './routes/health.router';
import authRouter from './routes/auth.router';
import {
  corsMiddleware,
  requestLogger,
  generalRateLimit,
  authRateLimit,
} from './middleware';
import { handleError } from './middleware/errorHandler.middleware';

// Create Hono application instance
const app = new Hono();

// Apply global middleware in order:
// 1. Request logging (logs all requests)
app.use('*', requestLogger());

// 2. CORS (handles cross-origin requests)
app.use('*', corsMiddleware());

// 3. General rate limiting (applies to all routes)
app.use('*', generalRateLimit());

// Global error handler
app.onError(handleError);

// Register public routes (no auth required)
app.route('/health', healthRouter);

// Register auth routes with stricter rate limiting
app.use('/api/v1/auth/*', authRateLimit());
app.route('/api/v1/auth', authRouter);

// Additional routes will be registered here
import organizationRouter from './routes/organization.router';
import incomeRouter from './routes/income.router';

// Register organization routes
app.route('/api/v1/orgs', organizationRouter);

// Register income routes
app.route('/api/v1/orgs', incomeRouter);

// TODO: Register expense router
// TODO: Register debt router
// TODO: Register calculation router
// TODO: Register Baby Steps router
// TODO: Register OpenAPI docs router

export default app;
