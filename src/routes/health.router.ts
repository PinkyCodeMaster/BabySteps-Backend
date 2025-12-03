import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { checkDatabaseConnection } from '../db';

// Create health check router
const healthRouter = new OpenAPIHono();

// Health check response schema
const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  version: z.string(),
  timestamp: z.string(),
  checks: z.object({
    database: z.enum(['connected', 'disconnected', 'error']),
  }),
  error: z.string().optional(),
});

// GET /health - Health check endpoint
const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Health check',
  description: 'Check the health status of the API and its dependencies',
  responses: {
    200: {
      description: 'Service is healthy',
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
    },
    503: {
      description: 'Service is unhealthy',
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

healthRouter.openapi(healthRoute, async (c) => {
  try {
    // Check database connection
    const dbHealthy = await checkDatabaseConnection();
    
    // Determine overall status
    const status = dbHealthy ? 'healthy' : 'unhealthy';
    const statusCode = dbHealthy ? 200 : 503;
    
    // Get version from package.json
    const version = process.env['npm_package_version'] || '1.0.0';
    
    return c.json({
      status,
      version,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy ? 'connected' : 'disconnected',
      },
    }, statusCode);
  } catch (error) {
    console.error('Health check error:', error);
    
    return c.json({
      status: 'unhealthy' as const,
      version: process.env['npm_package_version'] || '1.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'error' as const,
      },
      error: 'Health check failed',
    }, 503);
  }
});

export default healthRouter;
