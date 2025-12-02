import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../../db";
import { organization, member, user } from "../../db/schema";
import { organizationService } from "../../services/organization.service";
import { eq } from "drizzle-orm";

/**
 * Tests for Organization Service
 * 
 * Since Better Auth handles most organization operations (create, invite, etc.),
 * these tests focus on the additional business logic provided by the service:
 * - Property 9: Role changes apply immediately
 * - Property 10: Organization data isolation
 * - Property 11: Non-admin operations are rejected
 * 
 * Properties 6, 7, 8 are handled by Better Auth and tested through integration tests.
 */

describe("Organization Service", () => {
  let testOrgId: string;
  let testAdminUserId: string;
  let testMemberUserId: string;
  let testMemberId: string;
  let otherOrgId: string;
  let otherUserId: string;

  beforeAll(async () => {
    // Create test organization
    testOrgId = crypto.randomUUID();
    await db.insert(organization).values({
      id: testOrgId,
      name: "Test Organization",
      slug: `test-${testOrgId.slice(0, 8)}`,
      createdAt: new Date(),
      metadata: null,
      logo: null,
    });

    // Create admin user
    testAdminUserId = crypto.randomUUID();
    await db.insert(user).values({
      id: testAdminUserId,
      name: "Admin User",
      email: `admin-${testAdminUserId}@test.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      role: null,
      banned: false,
      banReason: null,
      banExpires: null,
    });

    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: testOrgId,
      userId: testAdminUserId,
      role: "admin",
      createdAt: new Date(),
    });

    // Create member user
    testMemberUserId = crypto.randomUUID();
    testMemberId = crypto.randomUUID();
    await db.insert(user).values({
      id: testMemberUserId,
      name: "Member User",
      email: `member-${testMemberUserId}@test.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      role: null,
      banned: false,
      banReason: null,
      banExpires: null,
    });

    await db.insert(member).values({
      id: testMemberId,
      organizationId: testOrgId,
      userId: testMemberUserId,
      role: "member",
      createdAt: new Date(),
    });

    // Create another organization for isolation testing
    otherOrgId = crypto.randomUUID();
    await db.insert(organization).values({
      id: otherOrgId,
      name: "Other Organization",
      slug: `other-${otherOrgId.slice(0, 8)}`,
      createdAt: new Date(),
      metadata: null,
      logo: null,
    });

    otherUserId = crypto.randomUUID();
    await db.insert(user).values({
      id: otherUserId,
      name: "Other User",
      email: `other-${otherUserId}@test.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      role: null,
      banned: false,
      banReason: null,
      banExpires: null,
    });

    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: otherOrgId,
      userId: otherUserId,
      role: "member",
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(member).where(eq(member.organizationId, testOrgId));
    await db.delete(member).where(eq(member.organizationId, otherOrgId));
    await db.delete(organization).where(eq(organization.id, testOrgId));
    await db.delete(organization).where(eq(organization.id, otherOrgId));
    await db.delete(user).where(eq(user.id, testAdminUserId));
    await db.delete(user).where(eq(user.id, testMemberUserId));
    await db.delete(user).where(eq(user.id, otherUserId));
  });

  /**
   * Feature: debt-snowball-api, Property 10: Organization data isolation
   * Validates: Requirements 2.5
   * 
   * For any user querying organization-scoped data, the results should contain
   * only records belonging to their organization.
   */
  describe("Property 10: Organization data isolation", () => {
    test("User can access their own organization", async () => {
      const org = await organizationService.getOrganization(testOrgId, testAdminUserId);
      expect(org.id).toBe(testOrgId);
      expect(org.name).toBe("Test Organization");
    });

    test("User cannot access another organization", async () => {
      try {
        await organizationService.getOrganization(otherOrgId, testAdminUserId);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("AUTHZ_002");
      }
    });

    test("listMembers returns only members of user's organization", async () => {
      const members = await organizationService.listMembers(testOrgId, testAdminUserId);
      
      // Should have 2 members (admin and member)
      expect(members.length).toBe(2);
      
      // All members should belong to testOrgId
      for (const m of members) {
        expect(m.organizationId).toBe(testOrgId);
      }
    });

    test("User cannot list members of another organization", async () => {
      try {
        await organizationService.listMembers(otherOrgId, testAdminUserId);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("AUTHZ_002");
      }
    });
  });

  /**
   * Feature: debt-snowball-api, Property 11: Non-admin operations are rejected
   * Validates: Requirements 2.6
   * 
   * For any non-admin user attempting admin operations, the request should be
   * rejected with authorization error.
   */
  describe("Property 11: Non-admin operations are rejected", () => {
    test("Non-admin cannot update member roles", async () => {
      try {
        await organizationService.updateMemberRole(
          testMemberId,
          "admin",
          testMemberUserId, // Non-admin user
          testOrgId
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("AUTHZ_003");
        expect(error.message).toContain("Only admins");
      }
    });

    test("Admin can update member roles", async () => {
      const updated = await organizationService.updateMemberRole(
        testMemberId,
        "viewer",
        testAdminUserId, // Admin user
        testOrgId
      );
      
      expect(updated.role).toBe("viewer");
      expect(updated.id).toBe(testMemberId);
    });
  });

  /**
   * Feature: debt-snowball-api, Property 9: Role changes apply immediately
   * Validates: Requirements 2.4
   * 
   * For any membership role change by admin, the new permissions should be
   * enforced on the next request.
   */
  describe("Property 9: Role changes apply immediately", () => {
    test("Role change is reflected immediately in database", async () => {
      // Change role to admin
      const updated = await organizationService.updateMemberRole(
        testMemberId,
        "admin",
        testAdminUserId,
        testOrgId
      );
      
      expect(updated.role).toBe("admin");
      
      // Verify by querying database
      const membership = await db
        .select()
        .from(member)
        .where(eq(member.id, testMemberId))
        .limit(1);
      
      expect(membership[0]?.role).toBe("admin");
    });

    test("User with updated role can perform admin operations", async () => {
      // testMemberUserId now has admin role from previous test
      // They should be able to update roles
      const anotherMemberId = crypto.randomUUID();
      const anotherUserId = crypto.randomUUID();
      
      await db.insert(user).values({
        id: anotherUserId,
        name: "Another User",
        email: `another-${anotherUserId}@test.com`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
        role: null,
        banned: false,
        banReason: null,
        banExpires: null,
      });

      await db.insert(member).values({
        id: anotherMemberId,
        organizationId: testOrgId,
        userId: anotherUserId,
        role: "member",
        createdAt: new Date(),
      });

      // testMemberUserId (now admin) should be able to update roles
      const updated = await organizationService.updateMemberRole(
        anotherMemberId,
        "viewer",
        testMemberUserId, // Now an admin
        testOrgId
      );
      
      expect(updated.role).toBe("viewer");

      // Cleanup
      await db.delete(member).where(eq(member.id, anotherMemberId));
      await db.delete(user).where(eq(user.id, anotherUserId));
    });

    test("Role change from admin to member removes admin privileges", async () => {
      // Change testMemberUserId back to member
      await organizationService.updateMemberRole(
        testMemberId,
        "member",
        testAdminUserId,
        testOrgId
      );

      // Create a test target
      const targetMemberId = crypto.randomUUID();
      const targetUserId = crypto.randomUUID();
      
      await db.insert(user).values({
        id: targetUserId,
        name: "Target User",
        email: `target-${targetUserId}@test.com`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
        role: null,
        banned: false,
        banReason: null,
        banExpires: null,
      });

      await db.insert(member).values({
        id: targetMemberId,
        organizationId: testOrgId,
        userId: targetUserId,
        role: "member",
        createdAt: new Date(),
      });

      // testMemberUserId (now member again) should NOT be able to update roles
      try {
        await organizationService.updateMemberRole(
          targetMemberId,
          "admin",
          testMemberUserId, // Now a member
          testOrgId
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
      }

      // Cleanup
      await db.delete(member).where(eq(member.id, targetMemberId));
      await db.delete(user).where(eq(user.id, targetUserId));
    });
  });
});
