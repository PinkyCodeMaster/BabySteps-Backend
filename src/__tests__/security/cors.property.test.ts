import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { Hono } from "hono";
import { corsMiddleware } from "../../middleware/cors.middleware";

/**
 * Property-Based Tests for CORS Middleware
 * 
 * These tests verify CORS security properties:
 * - Property 52: CORS allows approved domains
 * - Property 53: CORS rejects unapproved domains
 * 
 * Feature: debt-snowball-api
 */

// Helper to generate valid domain names
const validDomainArbitrary = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.constantFrom("com", "org", "net", "co.uk")
  )
  .map(([name, tld]) => `https://${name}.${tld}`);

// Helper to generate invalid/unapproved domains
const unapprovedDomainArbitrary = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.constantFrom("xyz", "test", "invalid")
  )
  .map(([name, tld]) => `https://${name}.${tld}`);

describe("CORS Property Tests", () => {
  /**
   * Property 52: CORS allows approved domains
   * 
   * For any request from an allowed domain, the system should accept it
   * with appropriate CORS headers.
   * 
   */
  describe("Property 52: CORS allows approved domains", () => {
    test("should allow requests from approved origins", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            "http://localhost:3000",
            "https://wolfpackdefence.co.uk",
            "https://app.wolfpackdefence.co.uk"
          ),
          async (approvedOrigin) => {
            // Set up test environment with approved origin
            const originalEnv = process.env['ALLOWED_ORIGINS'];
            process.env['ALLOWED_ORIGINS'] = approvedOrigin;

            try {
              // Create test app with CORS middleware
              const app = new Hono();
              app.use("*", corsMiddleware());
              app.get("/test", (c) => c.json({ success: true }));

              // Make request with approved origin
              const req = new Request("http://localhost:3000/test", {
                method: "GET",
                headers: {
                  Origin: approvedOrigin,
                },
              });

              const res = await app.fetch(req);

              // Should succeed
              expect(res.status).toBe(200);

              // Should have CORS headers
              const accessControlAllowOrigin = res.headers.get(
                "Access-Control-Allow-Origin"
              );
              
              // Should allow the origin
              expect(accessControlAllowOrigin).toBe(approvedOrigin);
            } finally {
              // Restore original environment
              if (originalEnv) {
                process.env['ALLOWED_ORIGINS'] = originalEnv;
              } else {
                delete process.env['ALLOWED_ORIGINS'];
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("should allow requests with no origin (mobile apps, Postman)", async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          // Set up test environment
          const originalEnv = process.env['ALLOWED_ORIGINS'];
          process.env['ALLOWED_ORIGINS'] = "http://localhost:3000";

          try {
            // Create test app with CORS middleware
            const app = new Hono();
            app.use("*", corsMiddleware());
            app.get("/test", (c) => c.json({ success: true }));

            // Make request without origin header
            const req = new Request("http://localhost:3000/test", {
              method: "GET",
            });

            const res = await app.fetch(req);

            // Should succeed (no origin is allowed for mobile apps, etc.)
            expect(res.status).toBe(200);
          } finally {
            // Restore original environment
            if (originalEnv) {
              process.env['ALLOWED_ORIGINS'] = originalEnv;
            } else {
              delete process.env['ALLOWED_ORIGINS'];
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 53: CORS rejects unapproved domains
   * 
   * For any request from a disallowed domain, the system should reject it
   * with CORS error (no Access-Control-Allow-Origin header).
   * 
   */
  describe("Property 53: CORS rejects unapproved domains", () => {
    test("should reject requests from unapproved origins", async () => {
      await fc.assert(
        fc.asyncProperty(unapprovedDomainArbitrary, async (unapprovedOrigin) => {
          // Set up test environment with specific approved origins
          const originalEnv = process.env['ALLOWED_ORIGINS'];
          process.env['ALLOWED_ORIGINS'] = "http://localhost:3000,https://wolfpackdefence.co.uk";

          try {
            // Ensure the unapproved origin is not in the allowed list
            const allowedOrigins = process.env['ALLOWED_ORIGINS']!.split(',');
            if (allowedOrigins.includes(unapprovedOrigin)) {
              // Skip this iteration if randomly generated origin matches allowed
              return;
            }

            // Create test app with CORS middleware
            const app = new Hono();
            app.use("*", corsMiddleware());
            app.get("/test", (c) => c.json({ success: true }));

            // Make request with unapproved origin
            const req = new Request("http://localhost:3000/test", {
              method: "GET",
              headers: {
                Origin: unapprovedOrigin,
              },
            });

            const res = await app.fetch(req);

            // The request may succeed (200) but should NOT have CORS headers
            // allowing the unapproved origin
            const accessControlAllowOrigin = res.headers.get(
              "Access-Control-Allow-Origin"
            );

            // Should either be null or not match the unapproved origin
            if (accessControlAllowOrigin !== null) {
              expect(accessControlAllowOrigin).not.toBe(unapprovedOrigin);
            }
          } finally {
            // Restore original environment
            if (originalEnv) {
              process.env['ALLOWED_ORIGINS'] = originalEnv;
            } else {
              delete process.env['ALLOWED_ORIGINS'];
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    test("should handle multiple approved origins correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validDomainArbitrary, { minLength: 2, maxLength: 5 }),
          unapprovedDomainArbitrary,
          async (approvedOrigins, unapprovedOrigin) => {
            // Ensure unapproved origin is not in approved list
            if (approvedOrigins.includes(unapprovedOrigin)) {
              return;
            }

            // Set up test environment
            const originalEnv = process.env['ALLOWED_ORIGINS'];
            process.env['ALLOWED_ORIGINS'] = approvedOrigins.join(',');

            try {
              // Create test app with CORS middleware
              const app = new Hono();
              app.use("*", corsMiddleware());
              app.get("/test", (c) => c.json({ success: true }));

              // Test approved origin
              const approvedReq = new Request("http://localhost:3000/test", {
                method: "GET",
                headers: {
                  Origin: approvedOrigins[0]!,
                },
              });

              const approvedRes = await app.fetch(approvedReq);
              expect(approvedRes.status).toBe(200);
              expect(approvedRes.headers.get("Access-Control-Allow-Origin")).toBe(
                approvedOrigins[0]
              );

              // Test unapproved origin
              const unapprovedReq = new Request("http://localhost:3000/test", {
                method: "GET",
                headers: {
                  Origin: unapprovedOrigin,
                },
              });

              const unapprovedRes = await app.fetch(unapprovedReq);
              const accessControlAllowOrigin = unapprovedRes.headers.get(
                "Access-Control-Allow-Origin"
              );

              // Should not allow unapproved origin
              if (accessControlAllowOrigin !== null) {
                expect(accessControlAllowOrigin).not.toBe(unapprovedOrigin);
              }
            } finally {
              // Restore original environment
              if (originalEnv) {
                process.env['ALLOWED_ORIGINS'] = originalEnv;
              } else {
                delete process.env['ALLOWED_ORIGINS'];
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
