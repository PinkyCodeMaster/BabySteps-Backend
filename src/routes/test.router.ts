import { Hono } from 'hono';
import { captureMessage, captureException } from '../lib/sentry';

const app = new Hono();

/**
 * Test endpoint to verify Sentry error logging
 * DELETE THIS IN PRODUCTION!
 */
app.get('/test/sentry-message', (c) => {
  captureMessage('Test message from API endpoint', 'info', {
    endpoint: '/test/sentry-message',
    timestamp: new Date().toISOString(),
  });
  
  return c.json({
    success: true,
    message: 'Test message sent to Sentry. Check your dashboard!',
  });
});

app.get('/test/sentry-error', (c) => {
  const error = new Error('Test error from API endpoint');
  
  captureException(error, {
    endpoint: '/test/sentry-error',
    timestamp: new Date().toISOString(),
    user: c.get('userId') || 'anonymous',
  });
  
  return c.json({
    success: true,
    message: 'Test error sent to Sentry. Check your dashboard!',
  });
});

app.get('/test/throw-error', (c) => {
  // This will be caught by the error handler middleware
  // which will automatically send it to Sentry
  throw new Error('Intentional test error - this should appear in Sentry!');
});

export default app;
