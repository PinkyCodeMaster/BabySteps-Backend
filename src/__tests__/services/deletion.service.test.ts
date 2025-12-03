import { describe, test, expect, beforeEach } from "bun:test";
import { deletionService } from "../../services/deletion.service";
import { db } from "../../db";
import { user } from "../../db/schema/users";
import { eq } from "drizzle-orm";

describe("DeletionService", () => {
  let testUserId: string;
  let testUserEmail: string;

  beforeEach(async () => {
    // Create a test user for deletion tests
    testUserEmail = `test-deletion-${Date.now()}@example.com`;
    const [createdUser] = await db
      .insert(user)
      .values({
        id: `test-user-${Date.now()}`,
        name: "Test User",
        email: testUserEmail,
        emailVerified: false,
      })
      .returning();

    testUserId = createdUser!.id;
  });

  test("softDeleteUser marks user as banned and anonymizes email", async () => {
    // Perform soft delete
    const result = await deletionService.softDeleteUser(testUserId, testUserId);

    // Verify result structure
    expect(result.userId).toBe(testUserId);
    expect(result.deletedAt).toBeDefined();
    expect(result.scheduledHardDeleteAt).toBeDefined();
    expect(result.message).toContain("marked for deletion");

    // Verify user is marked as banned in database
    const [deletedUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, testUserId))
      .limit(1);

    expect(deletedUser).toBeDefined();
    expect(deletedUser!.banned).toBe(true);
    expect(deletedUser!.banReason).toBe("ACCOUNT_DELETED");
    expect(deletedUser!.email).toContain("deleted-");
    expect(deletedUser!.email).toContain("@deleted.local");
    expect(deletedUser!.email).not.toBe(testUserEmail);
    expect(deletedUser!.banExpires).toBeDefined();
  });

  test("softDeleteUser throws error if user not found", async () => {
    const nonExistentUserId = "non-existent-user-id";

    await expect(
      deletionService.softDeleteUser(nonExistentUserId, testUserId)
    ).rejects.toThrow("User not found");
  });

  test("softDeleteUser throws error if user already deleted", async () => {
    // Delete user once
    await deletionService.softDeleteUser(testUserId, testUserId);

    // Try to delete again
    await expect(
      deletionService.softDeleteUser(testUserId, testUserId)
    ).rejects.toThrow("already deleted");
  });

  test("canDeleteUser returns true for self-deletion", async () => {
    const canDelete = await deletionService.canDeleteUser(testUserId, testUserId);
    expect(canDelete).toBe(true);
  });

  test("canDeleteUser returns false when trying to delete another user", async () => {
    const otherUserId = "other-user-id";
    const canDelete = await deletionService.canDeleteUser(otherUserId, testUserId);
    expect(canDelete).toBe(false);
  });

  test("scheduled hard delete date is 30 days in the future", async () => {
    const result = await deletionService.softDeleteUser(testUserId, testUserId);

    const scheduledDate = new Date(result.scheduledHardDeleteAt);
    const now = new Date();
    const daysDifference = Math.floor(
      (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Should be approximately 30 days (allow for small timing differences)
    expect(daysDifference).toBeGreaterThanOrEqual(29);
    expect(daysDifference).toBeLessThanOrEqual(30);
  });
});
