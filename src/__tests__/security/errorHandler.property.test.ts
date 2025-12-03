import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { Hono } from "hono";
import { handleError, AppError, ErrorCodes } from "../../middleware/errorHandler.middleware";
import { ZodError, z } from "zod";

/**
 * Property-Based Tests for Error Handler Middleware
 * 
 * These tests verify error handling security properties:
 * - Property 54: Error sanitization
 * 
 * Feature: debt-snowball-api
 */

// Helper to generate random error messages
const errorMessageArbitrary = fc.string({ minLength: 5, maxLength: 100 });

// Helper to generate sensitive data patterns
const sensitiveDataArbitrary = fc.oneof(
  fc.constant("password: secret123"),
  fc.constant("token: abc123xyz"),
  fc.constant("apiKey: sk_live_12345"),
  fc.constant("DATABASE_URL: postgresql://user:pass@host/db"),
  fc.constant("credit_card: 4532-1234-5678-9010"),
  fc.string({ minLength: 10, maxLength: 50 }).map(s => `secret_key: ${s}`)
);

describe("Error Handler Property Tests", () => {
  /**
   * Property 54: Error sanitization
   * 
   * For any error handled by the system, the response should be sanitized
   * without sensitive details and the full error should be logged.
   * 
   */
  describe("Property 54: Error sanitization", () => {
    test("should sanitize generic errors in production", async () => {
      await fc.assert(
        fc.asyncProperty(errorMessageArbitrary, async (errorMessage) => {
          // Set production environment
          const originalEnv = process.env['NODE_ENV'];
          process.env['NODE_ENV'] = 'production';

          try {
            // Create test app with error handler
            const app = new Hono();
            app.onError(handleError);
            
            app.get("/test", () => {
              throw new Error(errorMessage);
            });

            // Make request that triggers error
            const req = new Request("http://localhost:3000/test");
            const res = await app.fetch(req);

            // Should return 500
            expect(res.status).toBe(500);

            const body = await res.json();

            // Should have error structure
            expect(body.error).toBeDefined();
            expect(body.error.code).toBeDefined();
            expect(body.error.message).toBeDefined();

            // In production, generic errors should be sanitized
            // Should NOT leak the original error message
            expect(body.error.message).not.toBe(errorMessage);
            expect(body.error.message).toBe("An unexpected error occurred");

            // Should not include stack trace in production
            expect(body.error.details?.stack).toBeUndefined();
          } finally {
            // Restore original environment
            if (originalEnv) {
              process.env['NODE_ENV'] = originalEnv;
            } else {
              delete process.env['NODE_ENV'];
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    test("should preserve AppError messages in production", async () => {
      await fc.assert(
        fc.asyncProperty(
          errorMessageArbitrary,
          fc.constantFrom(
            ErrorCodes.AUTH_INVALID_CREDENTIALS,
            ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
            ErrorCodes.VAL_INVALID_REQUEST_SCHEMA,
            ErrorCodes.DEBT_CCJ_REQUIRES_DEADLINE
          ),
          fc.integer({ min: 400, max: 500 }),
          async (errorMessage, errorCode, statusCode) => {
            // Set production environment
            const originalEnv = process.env['NODE_ENV'];
            process.env['NODE_ENV'] = 'production';

            try {
              // Create test app with error handler
              const app = new Hono();
              app.onError(handleError);
              
              app.get("/test", () => {
                throw new AppError(errorCode, errorMessage, statusCode);
              });

              // Make request that triggers error
              const req = new Request("http://localhost:3000/test");
              const res = await app.fetch(req);

              // Should return the specified status code
              expect(res.status).toBe(statusCode);

              const body = await res.json();

              // Should have error structure
              expect(body.error).toBeDefined();
              expect(body.error.code).toBe(errorCode);
              
              // AppError messages should be preserved (they're intentional)
              expect(body.error.message).toBe(errorMessage);
            } finally {
              // Restore original environment
              if (originalEnv) {
                process.env['NODE_ENV'] = originalEnv;
              } else {
                delete process.env['NODE_ENV'];
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("should include error details in development", async () => {
      await fc.assert(
        fc.asyncProperty(errorMessageArbitrary, async (errorMessage) => {
          // Set development environment
          const originalEnv = process.env['NODE_ENV'];
          process.env['NODE_ENV'] = 'development';

          try {
            // Create test app with error handler
            const app = new Hono();
            app.onError(handleError);
            
            app.get("/test", () => {
              throw new Error(errorMessage);
            });

            // Make request that triggers error
            const req = new Request("http://localhost:3000/test");
            const res = await app.fetch(req);

            // Should return 500
            expect(res.status).toBe(500);

            const body = await res.json();

            // Should have error structure
            expect(body.error).toBeDefined();
            
            // In development, should include original message
            expect(body.error.message).toBe(errorMessage);

            // Should include stack trace in development
            expect(body.error.details?.stack).toBeDefined();
          } finally {
            // Restore original environment
            if (originalEnv) {
              process.env['NODE_ENV'] = originalEnv;
            } else {
              delete process.env['NODE_ENV'];
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    test("should format Zod validation errors properly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            age: fc.integer({ min: 0, max: 150 }),
          }),
          async (validData) => {
            // Set production environment
            const originalEnv = process.env['NODE_ENV'];
            process.env['NODE_ENV'] = 'production';

            try {
              // Create test app with error handler
              const app = new Hono();
              app.onError(handleError);
              
              // Define a schema that will fail validation
              const schema = z.object({
                name: z.string().min(1),
                age: z.number().min(0),
                email: z.string().email(), // This field is missing
              });

              app.post("/test", async (c) => {
                const body = await c.req.json();
                schema.parse(body); // Will throw ZodError
                return c.json({ success: true });
              });

              // Make request with invalid data (missing email)
              const req = new Request("http://localhost:3000/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validData),
              });
              
              const res = await app.fetch(req);

              // Should return 400 for validation error
              expect(res.status).toBe(400);

              const body = await res.json();

              // Should have error structure
              expect(body.error).toBeDefined();
              expect(body.error.code).toBe(ErrorCodes.VAL_INVALID_REQUEST_SCHEMA);
              expect(body.error.message).toBe("Request validation failed");
              
              // Should have formatted validation details
              expect(body.error.details).toBeDefined();
              expect(body.error.details.email).toBeDefined();
            } finally {
              // Restore original environment
              if (originalEnv) {
                process.env['NODE_ENV'] = originalEnv;
              } else {
                delete process.env['NODE_ENV'];
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("should not leak sensitive data in error responses", async () => {
      await fc.assert(
        fc.asyncProperty(sensitiveDataArbitrary, async (sensitiveData) => {
          // Set production environment
          const originalEnv = process.env['NODE_ENV'];
          process.env['NODE_ENV'] = 'production';

          try {
            // Create test app with error handler
            const app = new Hono();
            app.onError(handleError);
            
            app.get("/test", () => {
              // Throw error with sensitive data
              throw new Error(`Database connection failed: ${sensitiveData}`);
            });

            // Make request that triggers error
            const req = new Request("http://localhost:3000/test");
            const res = await app.fetch(req);

            // Should return 500
            expect(res.status).toBe(500);

            const body = await res.json();
            const responseText = JSON.stringify(body);

            // Should NOT include the sensitive data in response
            expect(responseText).not.toContain(sensitiveData);
            
            // Should return generic message
            expect(body.error.message).toBe("An unexpected error occurred");
          } finally {
            // Restore original environment
            if (originalEnv) {
              process.env['NODE_ENV'] = originalEnv;
            } else {
              delete process.env['NODE_ENV'];
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    test("should map common error patterns to appropriate status codes", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            { pattern: "not found", expectedStatus: 404 },
            { pattern: "unauthorized", expectedStatus: 401 },
            { pattern: "authentication", expectedStatus: 401 },
            { pattern: "forbidden", expectedStatus: 403 },
            { pattern: "permission", expectedStatus: 403 },
            { pattern: "conflict", expectedStatus: 409 },
            { pattern: "duplicate", expectedStatus: 409 }
          ),
          async ({ pattern, expectedStatus }) => {
            // Set production environment
            const originalEnv = process.env['NODE_ENV'];
            process.env['NODE_ENV'] = 'production';

            try {
              // Create test app with error handler
              const app = new Hono();
              app.onError(handleError);
              
              app.get("/test", () => {
                throw new Error(`Something went wrong: ${pattern}`);
              });

              // Make request that triggers error
              const req = new Request("http://localhost:3000/test");
              const res = await app.fetch(req);

              // Should return the expected status code
              expect(res.status).toBe(expectedStatus);

              const body = await res.json();

              // Should have error structure
              expect(body.error).toBeDefined();
              expect(body.error.code).toBeDefined();
              expect(body.error.message).toBeDefined();
            } finally {
              // Restore original environment
              if (originalEnv) {
                process.env['NODE_ENV'] = originalEnv;
              } else {
                delete process.env['NODE_ENV'];
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("should always return standardized error format", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            errorMessageArbitrary.map(msg => new Error(msg)),
            fc.record({
              code: fc.constantFrom(...Object.values(ErrorCodes)),
              message: errorMessageArbitrary,
              statusCode: fc.integer({ min: 400, max: 500 }),
            }).map(({ code, message, statusCode }) => new AppError(code, message, statusCode))
          ),
          async (error) => {
            // Set production environment
            const originalEnv = process.env['NODE_ENV'];
            process.env['NODE_ENV'] = 'production';

            try {
              // Create test app with error handler
              const app = new Hono();
              app.onError(handleError);
              
              app.get("/test", () => {
                throw error;
              });

              // Make request that triggers error
              const req = new Request("http://localhost:3000/test");
              const res = await app.fetch(req);

              const body = await res.json();

              // Should always have standardized format
              expect(body).toHaveProperty("error");
              expect(body.error).toHaveProperty("code");
              expect(body.error).toHaveProperty("message");
              
              // Code should be a string
              expect(typeof body.error.code).toBe("string");
              
              // Message should be a string
              expect(typeof body.error.message).toBe("string");
              
              // Details is optional but if present should be an object
              if (body.error.details !== undefined) {
                expect(typeof body.error.details).toBe("object");
              }
            } finally {
              // Restore original environment
              if (originalEnv) {
                process.env['NODE_ENV'] = originalEnv;
              } else {
                delete process.env['NODE_ENV'];
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
