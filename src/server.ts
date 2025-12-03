import app from './app';
import { validateEnv, getConfig } from './config';
import { initializeCacheService } from './services/cache.service';
import { logger } from './lib/logger';
import { initializeSentry, flushSentry } from './lib/sentry';

// Validate environment configuration on startup
// This will fail fast if any required variables are missing or invalid
validateEnv();

// Get validated configuration
const config = getConfig();
const port = config.PORT;

// Initialize Sentry error tracking
initializeSentry();

// Initialize cache service if Redis is configured
if (config.REDIS_URL) {
  try {
    const url = new URL(config.REDIS_URL);
    initializeCacheService({
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
      db: url.pathname ? parseInt(url.pathname.slice(1)) : 0,
      keyPrefix: 'debt-snowball:',
    });
    logger.info('Cache service initialized with Redis');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to initialize cache service, continuing without caching');
  }
} else {
  logger.info('Cache service disabled (REDIS_URL not configured)');
}

// Start Bun server
const server = Bun.serve({
  port,
  fetch: app.fetch,
});

logger.info({ port, env: config.NODE_ENV }, 'Server started successfully');

// Graceful shutdown handling
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  try {
    // Flush Sentry events before shutdown
    await flushSentry(2000);
    logger.info('Sentry events flushed');
    
    // Close cache service connection
    const { getCacheService } = await import('./services/cache.service');
    const cacheService = getCacheService();
    if (cacheService.isEnabled()) {
      await cacheService.close();
      logger.info('Cache service closed');
    }
    
    // Stop accepting new connections
    server.stop();
    
    logger.info('Server stopped successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled rejection');
  shutdown();
});
