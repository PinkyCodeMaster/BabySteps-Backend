import { Hono } from 'hono';
import { checkDatabaseConnection } from '../db';

// Create health check router
const healthRouter = new Hono();

// GET /health - Health check endpoint
healthRouter.get('/', async (c) => {
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
      status: 'unhealthy',
      version: process.env['npm_package_version'] || '1.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'error',
      },
      error: 'Health check failed',
    }, 503);
  }
});

export default healthRouter;
