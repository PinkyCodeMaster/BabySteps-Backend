/**
 * Test Setup Helpers
 * 
 * Common utilities for setting up test data across service tests.
 * Reduces repetition and ensures consistent test data structure.
 */

import { db } from "../../db";
import { organization, member, user } from "../../db/schema";
import { eq } from "drizzle-orm";

export interface TestOrganization {
  orgId: string;
  adminUserId: string;
  memberUserId: string;
  memberId: string;
}

export interface TestContext {
  testOrg: TestOrganization;
  otherOrg: TestOrganization;
}

/**
 * Create a test organization with admin and member users
 */
export async function createTestOrganization(
  orgName: string,
  slugPrefix: string
): Promise<TestOrganization> {
  const orgId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const memberUserId = crypto.randomUUID();
  const memberId = crypto.randomUUID();

  // Create organization
  await db.insert(organization).values({
    id: orgId,
    name: orgName,
    slug: `${slugPrefix}-${orgId.slice(0, 8)}`,
    createdAt: new Date(),
    metadata: null,
    logo: null,
  });

  // Create admin user
  await db.insert(user).values({
    id: adminUserId,
    name: `${orgName} Admin`,
    email: `admin-${adminUserId}@test.com`,
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
    organizationId: orgId,
    userId: adminUserId,
    role: "admin",
    createdAt: new Date(),
  });

  // Create member user
  await db.insert(user).values({
    id: memberUserId,
    name: `${orgName} Member`,
    email: `member-${memberUserId}@test.com`,
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
    id: memberId,
    organizationId: orgId,
    userId: memberUserId,
    role: "member",
    createdAt: new Date(),
  });

  return {
    orgId,
    adminUserId,
    memberUserId,
    memberId,
  };
}

/**
 * Create standard test context with two organizations
 */
export async function createTestContext(): Promise<TestContext> {
  const testOrg = await createTestOrganization("Test Organization", "test");
  const otherOrg = await createTestOrganization("Other Organization", "other");

  return {
    testOrg,
    otherOrg,
  };
}

/**
 * Clean up a test organization and its users
 */
export async function cleanupTestOrganization(testOrg: TestOrganization): Promise<void> {
  await db.delete(member).where(eq(member.organizationId, testOrg.orgId));
  await db.delete(organization).where(eq(organization.id, testOrg.orgId));
  await db.delete(user).where(eq(user.id, testOrg.adminUserId));
  await db.delete(user).where(eq(user.id, testOrg.memberUserId));
}

/**
 * Clean up test context (both organizations)
 */
export async function cleanupTestContext(context: TestContext): Promise<void> {
  await cleanupTestOrganization(context.testOrg);
  await cleanupTestOrganization(context.otherOrg);
}
