import { OpenAPIHono } from '@hono/zod-openapi';
import healthRouter from './routes/health.router';
import authRouter from './routes/auth.router';
import {
  corsMiddleware,
  requestLogger,
  generalRateLimit,
  authRateLimit,
} from './middleware';
import { handleError } from './middleware/errorHandler.middleware';

// Create OpenAPIHono application instance with metadata
const app = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VAL_001',
            message: 'Invalid request schema',
            details: result.error.format(),
          },
        },
        400
      );
    }
    return;
  },
});

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
import expenseRouter from './routes/expense.router';
import debtRouter from './routes/debt.router';
import calculationRouter from './routes/calculation.router';
import babyStepsRouter from './routes/babySteps.router';
import userRouter from './routes/user.router';

// Register organization routes
app.route('/api/v1/orgs', organizationRouter);

// Register income routes
app.route('/api/v1/orgs', incomeRouter);

// Register expense routes
app.route('/api/v1/orgs', expenseRouter);

// Register debt routes
app.route('/api/v1/orgs', debtRouter);

// Register calculation routes
app.route('/api/v1/orgs', calculationRouter);

// Register Baby Steps routes
app.route('/api/v1/orgs', babyStepsRouter);

// Register user routes
app.route('/api/v1/users', userRouter);

// Configure OpenAPI metadata
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Debt Snowball API',
    version: '1.0.0',
    description: 'A backend system for managing family finances using the debt snowball method and Dave Ramsey\'s Baby Steps framework. Supports multi-user organizations, income and expense tracking, debt management with Universal Credit taper calculations, and debt-free date projections.',
  },
  servers: [
    {
      url: process.env['BETTER_AUTH_URL'] || 'http://localhost:3000',
      description: 'API Server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Authentication', description: 'User authentication and session management' },
    { name: 'Organizations', description: 'Organization and membership management' },
    { name: 'Users', description: 'User account management and deletion' },
    { name: 'Incomes', description: 'Income tracking and management' },
    { name: 'Expenses', description: 'Expense tracking and management' },
    { name: 'Debts', description: 'Debt tracking and payment management' },
    { name: 'Calculations', description: 'Financial calculations (snowball, debt-free date, disposable income)' },
    { name: 'Baby Steps', description: 'Dave Ramsey Baby Steps progress tracking' },
  ],
});

// Configure Scalar API documentation UI
import { Scalar } from '@scalar/hono-api-reference';

app.get(
  '/docs',
  Scalar({
    url: '/openapi.json',
    servers: [{ url: process.env['BETTER_AUTH_URL'] || 'http://localhost:9000' }],
    layout: 'modern',
    hideTestRequestButton: false,
    hideSearch: false,
    hideModels: false,
    hideDarkModeToggle: true,
    hideClientButton: true,
    expandAllResponses: true,
    expandAllModelSections: true,
    theme: 'bluePlanet',
    showSidebar: true,
    showDeveloperTools: 'localhost',
    operationTitleSource: 'summary',
    persistAuth: false,
    telemetry: true,
    isEditable: false,
    isLoading: false,
    documentDownloadType: 'json',
    showOperationId: false,
    withDefaultFonts: true,
    defaultOpenAllTags: false,
    orderSchemaPropertiesBy: 'alpha',
    orderRequiredPropertiesFirst: true,
    _integration: 'hono',
    default: false,
    slug: 'api-1',
    title: 'API #1'
  })
);

export default app;
