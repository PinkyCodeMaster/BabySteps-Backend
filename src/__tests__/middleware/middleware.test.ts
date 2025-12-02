import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import {
  corsMiddleware,
  handleError,
  AppError,
  ErrorCodes,
  requestLogger,
  rateLimit,
} from '../../middleware/index';

describe('Middleware Tests', () => {
  describe('CORS Middleware', () => {
    test('should allow requests from allowed origins', async () => {
      const app = new Hono();
      app.use('*', corsMiddleware());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: {
          Origin: 'http://localhost:3000',
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
  });

  describe('Error Handler Middleware', () => {
    test('should handle AppError with custom error code', async () => {
      const app = new Hono();
      app.onError(handleError);
      app.get('/test', () => {
        throw new AppError(
          ErrorCodes.AUTH_INVALID_CREDENTIALS,
          'Invalid credentials',
          401
        );
      });

      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
      expect(body.error.message).toBe('Invalid credentials');
    });

    test('should sanitize generic errors', async () => {
      const app = new Hono();
      app.onError(handleError);
      app.get('/test', () => {
        throw new Error('Database connection failed');
      });

      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error.code).toBe(ErrorCodes.SRV_INTERNAL_ERROR);
    });

    test('should handle not found errors', async () => {
      const app = new Hono();
      app.onError(handleError);
      app.get('/test', () => {
        throw new Error('Resource not found');
      });

      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error.code).toBe(ErrorCodes.RES_NOT_FOUND);
    });
  });

  describe('Request Logger Middleware', () => {
    test('should add X-Request-Id header', async () => {
      const app = new Hono();
      app.use('*', requestLogger());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.headers.get('X-Request-Id')).toBeTruthy();
      expect(res.headers.get('X-Request-Id')).toMatch(/^req_/);
    });
  });

  describe('Rate Limit Middleware', () => {
    test('should allow requests within limit', async () => {
      const app = new Hono();
      app.use(
        '*',
        rateLimit({
          windowMs: 60000,
          maxRequests: 5,
        })
      );
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
    });

    test('should block requests exceeding limit', async () => {
      const app = new Hono();
      app.onError(handleError);
      app.use(
        '*',
        rateLimit({
          windowMs: 60000,
          maxRequests: 2,
        })
      );
      app.get('/test', (c) => c.json({ ok: true }));

      // Make requests up to limit
      await app.request('/test');
      await app.request('/test');

      // This should be blocked
      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(body.error.code).toBe(ErrorCodes.RATE_LIMIT_EXCEEDED);
      expect(res.headers.get('Retry-After')).toBeTruthy();
    });
  });
});
