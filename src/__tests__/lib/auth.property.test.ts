import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fc from "fast-check";
import { auth } from "../../lib/auth";
import { db } from "../../db";
import { user, session, account, organization, member } from "../../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Property-Based Tests for Authentication
 * 
 * These tests verify the core authentication properties:
 * - Property 1: Registration creates encrypted accounts
 * - Property 2: Login issues valid session tokens
 * - Property 3: Session validation attaches user context
 * - Property 4: Expired sessions are rejected
 * - Property 5: Organization membership controls access
 * 
 */

// Helper to generate valid email addresses
const emailArbitrary = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{3,10}$/),
    fc.constantFrom("test.com", "example.com", "demo.org")
  )
  .map(([local, domain]) => `${local}@${domain}`);

// Helper to generate valid passwords (min 8 chars)
const passwordArbitrary = fc.string({ minLength: 8, maxLength: 20 });

// Helper to generate user registration data
const registrationDataArbitrary = fc.record({
  email: emailArbitrary,
  password: passwordArbitrary,
  name: fc.string({ minLength: 1, maxLength: 50 }),
});

describe("Authentication Property Tests", () => {
  /** * Property 1: Registration creates encrypted accounts
   * 
   * For any valid registration credentials, creating a user account should result
   * in a user record with encrypted password (not plaintext).
   * 
   * NOTE: These tests require a running server at http://localhost:9000
   * Run `bun run dev` in a separate terminal before running these tests.
   */
  describe("Property 1: Registration creates encrypted accounts", () => {
    test.skip("should create user accounts with encrypted passwords", async () => {
      await fc.assert(
        fc.asyncProperty(registrationDataArbitrary, async (regData) => {
          // Register user via Better Auth
          const response = await fetch("http://localhost:9000/api/v1/auth/sign-up/email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: regData.email,
              password: regData.password,
              name: regData.name,
            }),
          });

          // Should succeed or fail with duplicate email or rate limit
          if (response.status === 200) {
            const data = await response.json();
            
            // Verify user was created
            expect(data.user).toBeDefined();
            expect(data.user.email).toBe(regData.email);
            expect(data.user.name).toBe(regData.name);

            // Verify password is NOT stored in user table (Better Auth uses account table)
            const userRecord = await db
              .select()
              .from(user)
              .where(eq(user.email, regData.email))
              .limit(1);

            expect(userRecord.length).toBe(1);
            expect(userRecord[0]).toBeDefined();
            
            // User table should not have password field
            expect((userRecord[0] as any).password).toBeUndefined();

            // Check account table for encrypted password
            const accountRecord = await db
              .select()
              .from(account)
              .where(eq(account.userId, userRecord[0]!.id))
              .limit(1);

            expect(accountRecord.length).toBe(1);
            expect(accountRecord[0]?.password).toBeDefined();
            
            // Password should be hashed (not plaintext)
            expect(accountRecord[0]?.password).not.toBe(regData.password);
            expect(accountRecord[0]?.password?.length).toBeGreaterThan(20); // Hashed passwords are long

            // Cleanup
            await db.delete(account).where(eq(account.userId, userRecord[0]!.id));
            await db.delete(user).where(eq(user.id, userRecord[0]!.id));
          } else if (response.status === 400) {
            // Duplicate email is acceptable
            const error = await response.json();
            expect(error.error).toBeDefined();
          } else if (response.status === 429) {
            // Rate limit hit - skip this iteration
            return;
          } else {
            throw new Error(`Unexpected status: ${response.status}`);
          }
        }),
        { numRuns: 10 } // Run 10 iterations for property test
      );
    });
  });

  /** * Property 2: Login issues valid session tokens
   * 
   * For any registered user with valid credentials, logging in should return
   * a session token that can be used for authenticated requests.
   */
  describe("Property 2: Login issues valid session tokens", () => {
    test.skip("should issue valid session tokens on successful login", async () => {
      await fc.assert(
        fc.asyncProperty(registrationDataArbitrary, async (regData) => {
          // First, register the user
          const signupResponse = await fetch("http://localhost:9000/api/v1/auth/sign-up/email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: regData.email,
              password: regData.password,
              name: regData.name,
            }),
          });

          if (signupResponse.status !== 200) {
            // Skip if user already exists
            return;
          }

          const signupData = await signupResponse.json();
          const userId = signupData.user.id;

          try {
            // Now login with the same credentials
            const loginResponse = await fetch("http://localhost:9000/api/v1/auth/sign-in/email", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: regData.email,
                password: regData.password,
              }),
            });

            expect(loginResponse.status).toBe(200);
            
            const loginData = await loginResponse.json();
            
            // Should return user and session
            expect(loginData.user).toBeDefined();
            expect(loginData.user.email).toBe(regData.email);

            // Should have session cookie
            const cookies = loginResponse.headers.get("set-cookie");
            expect(cookies).toBeDefined();
            expect(cookies).toContain("debt_snowball");

            // Verify session was created in database
            const sessionRecord = await db
              .select()
              .from(session)
              .where(eq(session.userId, userId))
              .limit(1);

            expect(sessionRecord.length).toBe(1);
            expect(sessionRecord[0]?.token).toBeDefined();
            expect(sessionRecord[0]?.expiresAt).toBeDefined();
            
            // Session should not be expired
            expect(sessionRecord[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

          } finally {
            // Cleanup
            await db.delete(session).where(eq(session.userId, userId));
            await db.delete(account).where(eq(account.userId, userId));
            await db.delete(user).where(eq(user.id, userId));
          }
        }),
        { numRuns: 10 }
      );
    });
  });

  /** * Property 3: Session validation attaches user context
   * 
   * For any valid session token, making an authenticated request should result
   * in the user's identity and organization being attached to the request context.
   */
  describe("Property 3: Session validation attaches user context", () => {
    test.skip("should attach user context for valid sessions", async () => {
      await fc.assert(
        fc.asyncProperty(registrationDataArbitrary, async (regData) => {
          // Register and login
          const signupResponse = await fetch("http://localhost:9000/api/v1/auth/sign-up/email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: regData.email,
              password: regData.password,
              name: regData.name,
            }),
          });

          if (signupResponse.status !== 200) {
            return; // Skip if user exists
          }

          const signupData = await signupResponse.json();
          const userId = signupData.user.id;

          try {
            const loginResponse = await fetch("http://localhost:9000/api/v1/auth/sign-in/email", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: regData.email,
                password: regData.password,
              }),
            });

            const cookies = loginResponse.headers.get("set-cookie");
            expect(cookies).toBeDefined();

            // Extract session cookie
            const sessionCookie = cookies!.split(";")[0];

            // Make authenticated request to get session
            const sessionResponse = await fetch("http://localhost:9000/api/v1/auth/get-session", {
              method: "GET",
              headers: {
                "Cookie": sessionCookie!,
              },
            });

            expect(sessionResponse.status).toBe(200);
            const sessionData = await sessionResponse.json();

            // Verify user context is attached
            expect(sessionData.user).toBeDefined();
            expect(sessionData.user.id).toBe(userId);
            expect(sessionData.user.email).toBe(regData.email);
            expect(sessionData.session).toBeDefined();
            expect(sessionData.session.userId).toBe(userId);

          } finally {
            // Cleanup
            await db.delete(session).where(eq(session.userId, userId));
            await db.delete(account).where(eq(account.userId, userId));
            await db.delete(user).where(eq(user.id, userId));
          }
        }),
        { numRuns: 10 }
      );
    });
  });

  /** * Property 4: Expired sessions are rejected
   * 
   * For any expired session token, making a request should result in rejection
   * with authentication error.
   */
  describe("Property 4: Expired sessions are rejected", () => {
    test.skip("should reject requests with expired sessions", async () => {
      await fc.assert(
        fc.asyncProperty(registrationDataArbitrary, async (regData) => {
          // Register user
          const signupResponse = await fetch("http://localhost:9000/api/v1/auth/sign-up/email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: regData.email,
              password: regData.password,
              name: regData.name,
            }),
          });

          if (signupResponse.status !== 200) {
            return; // Skip if user exists
          }

          const signupData = await signupResponse.json();
          const userId = signupData.user.id;

          try {
            // Create a session manually with expired date
            const expiredSessionId = crypto.randomUUID();
            const expiredToken = crypto.randomUUID();
            const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago

            await db.insert(session).values({
              id: expiredSessionId,
              userId: userId,
              token: expiredToken,
              expiresAt: pastDate,
              createdAt: new Date(),
              updatedAt: new Date(),
              ipAddress: null,
              userAgent: null,
              impersonatedBy: null,
              activeOrganizationId: null,
            });

            // Try to use expired session
            const sessionResponse = await fetch("http://localhost:9000/api/v1/auth/get-session", {
              method: "GET",
              headers: {
                "Cookie": `debt_snowball_session=${expiredToken}`,
              },
            });

            // Should be rejected (401 or session not found)
            expect(sessionResponse.status).not.toBe(200);

          } finally {
            // Cleanup
            await db.delete(session).where(eq(session.userId, userId));
            await db.delete(account).where(eq(account.userId, userId));
            await db.delete(user).where(eq(user.id, userId));
          }
        }),
        { numRuns: 10 }
      );
    });
  });

  /** * Property 5: Organization membership controls access
   * 
   * For any user with valid session, accessing protected endpoints should be
   * authorized only if the user has membership in the relevant organization.
   */
  describe("Property 5: Organization membership controls access", () => {
    test.skip("should allow access only to user's own organization", async () => {
      await fc.assert(
        fc.asyncProperty(
          registrationDataArbitrary,
          registrationDataArbitrary,
          async (user1Data, user2Data) => {
            // Ensure different emails
            if (user1Data.email === user2Data.email) {
              return;
            }

            // Register two users
            const user1Response = await fetch("http://localhost:9000/api/v1/auth/sign-up/email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: user1Data.email,
                password: user1Data.password,
                name: user1Data.name,
              }),
            });

            if (user1Response.status !== 200) {
              return; // Skip if user exists
            }

            const user1 = await user1Response.json();
            const user1Id = user1.user.id;

            const user2Response = await fetch("http://localhost:9000/api/v1/auth/sign-up/email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: user2Data.email,
                password: user2Data.password,
                name: user2Data.name,
              }),
            });

            if (user2Response.status !== 200) {
              // Cleanup user1 and skip
              await db.delete(account).where(eq(account.userId, user1Id));
              await db.delete(user).where(eq(user.id, user1Id));
              return;
            }

            const user2 = await user2Response.json();
            const user2Id = user2.user.id;

            try {
              // Create two organizations
              const org1Id = crypto.randomUUID();
              const org2Id = crypto.randomUUID();

              await db.insert(organization).values({
                id: org1Id,
                name: "Org 1",
                slug: `org1-${org1Id.slice(0, 8)}`,
                createdAt: new Date(),
                metadata: null,
                logo: null,
              });

              await db.insert(organization).values({
                id: org2Id,
                name: "Org 2",
                slug: `org2-${org2Id.slice(0, 8)}`,
                createdAt: new Date(),
                metadata: null,
                logo: null,
              });

              // Add user1 to org1
              await db.insert(member).values({
                id: crypto.randomUUID(),
                organizationId: org1Id,
                userId: user1Id,
                role: "admin",
                createdAt: new Date(),
              });

              // Add user2 to org2
              await db.insert(member).values({
                id: crypto.randomUUID(),
                organizationId: org2Id,
                userId: user2Id,
                role: "admin",
                createdAt: new Date(),
              });

              // Login user1
              const login1Response = await fetch("http://localhost:9000/api/v1/auth/sign-in/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: user1Data.email,
                  password: user1Data.password,
                }),
              });

              const cookies1 = login1Response.headers.get("set-cookie");
              expect(cookies1).toBeDefined();

              // Set active organization for user1
              await db
                .update(session)
                .set({ activeOrganizationId: org1Id })
                .where(eq(session.userId, user1Id));

              // User1 should be able to access org1 data
              const org1Response = await fetch(`http://localhost:9000/api/v1/orgs/${org1Id}`, {
                method: "GET",
                headers: {
                  "Cookie": cookies1!.split(";")[0]!,
                },
              });

              // Should succeed (200) or require additional setup
              expect([200, 404]).toContain(org1Response.status);

              // User1 should NOT be able to access org2 data
              const org2Response = await fetch(`http://localhost:9000/api/v1/orgs/${org2Id}`, {
                method: "GET",
                headers: {
                  "Cookie": cookies1!.split(";")[0]!,
                },
              });

              // Should be forbidden (403) or not found (404)
              expect([403, 404]).toContain(org2Response.status);

              // Cleanup organizations
              await db.delete(member).where(eq(member.organizationId, org1Id));
              await db.delete(member).where(eq(member.organizationId, org2Id));
              await db.delete(organization).where(eq(organization.id, org1Id));
              await db.delete(organization).where(eq(organization.id, org2Id));

            } finally {
              // Cleanup users
              await db.delete(session).where(eq(session.userId, user1Id));
              await db.delete(session).where(eq(session.userId, user2Id));
              await db.delete(account).where(eq(account.userId, user1Id));
              await db.delete(account).where(eq(account.userId, user2Id));
              await db.delete(user).where(eq(user.id, user1Id));
              await db.delete(user).where(eq(user.id, user2Id));
            }
          }
        ),
        { numRuns: 5 } // Fewer runs due to complexity
      );
    });
  });
});
