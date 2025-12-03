import app from './app';
import { validateEnv, getConfig } from './config';

// Validate environment configuration on startup
// This will fail fast if any required variables are missing or invalid
validateEnv();

// Get validated configuration
const config = getConfig();
const port = config.PORT;

// Start Bun server
const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`🚀 Server running at http://localhost:${port}`);

// Graceful shutdown handling
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  try {
    // Stop accepting new connections
    server.stop();
    
    console.log('✅ Server stopped successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});
