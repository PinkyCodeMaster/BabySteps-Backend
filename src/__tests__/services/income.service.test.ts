import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { db } from "../../db";
import { organization, member, user, income } from "../../db/schema";
import { incomeService } from "../../services/income.service";
import { eq, and } from "drizzle-orm";
import Decimal from "decimal.js";
import fc from "fast-check";

/**
 * Property-Based Tests for Income Service
 * 
 * Tests the following correctness properties:
 * - Property 12: Income creation with organization association
 * - Property 13: Frequency validation for income
 * - Property 15: Net income calculation treatment
 * - Property 16: Income updates respect organization boundaries
 * - Property 17: Income deletion triggers recalculation
 * */

describe("Income Service - Property Tests", () => {
  let testOrgId: string;
  let testUserId: string;
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

    // Create test user
    testUserId = crypto.randomUUID();
    await db.insert(user).values({
      id: testUserId,
      name: "Test User",
      email: `test-${testUserId}@test.com`,
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
      userId: testUserId,
      role: "member",
      createdAt: new Date(),
    });

    // Create another organization for boundary testing
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
    await db.delete(income).where(eq(income.organizationId, testOrgId));
    await db.delete(income).where(eq(income.organizationId, otherOrgId));
    await db.delete(member).where(eq(member.organizationId, testOrgId));
    await db.delete(member).where(eq(member.organizationId, otherOrgId));
    await db.delete(organization).where(eq(organization.id, testOrgId));
    await db.delete(organization).where(eq(organization.id, otherOrgId));
    await db.delete(user).where(eq(user.id, testUserId));
    await db.delete(user).where(eq(user.id, otherUserId));
  });

  beforeEach(async () => {
    // Clean up incomes before each test
    await db.delete(income).where(eq(income.organizationId, testOrgId));
    await db.delete(income).where(eq(income.organizationId, otherOrgId));
  });

  /** * Property 12: Income creation with organization association   * 
   * For any valid income data, creating an income should store it with the user's
   * organization ID and all required fields validated.
   */
  describe("Property 12: Income creation with organization association", () => {
    test("Created income is associated with correct organization", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            amount: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => n.toFixed(2)),
            frequency: fc.constantFrom("weekly", "fortnightly", "monthly", "annual", "one-time"),
            isNet: fc.boolean(),
          }),
          async (incomeData) => {
            const created = await incomeService.createIncome(
              testOrgId,
              testUserId,
              incomeData
            );

            // Property: Income must be associated with the correct organization
            expect(created.organizationId).toBe(testOrgId);
            expect(created.type).toBe(incomeData.type);
            expect(created.name).toBe(incomeData.name);
            expect(created.amount).toBe(incomeData.amount);
            expect(created.frequency).toBe(incomeData.frequency);
            expect(created.isNet).toBe(incomeData.isNet);
            expect(created.id).toBeDefined();
            expect(created.createdAt).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });

    test("Income can be retrieved after creation", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            amount: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => n.toFixed(2)),
            frequency: fc.constantFrom("weekly", "fortnightly", "monthly", "annual", "one-time"),
            isNet: fc.boolean(),
          }),
          async (incomeData) => {
            const created = await incomeService.createIncome(
              testOrgId,
              testUserId,
              incomeData
            );

            // Property: Created income should be retrievable
            const retrieved = await incomeService.getIncome(created.id, testOrgId);
            expect(retrieved.id).toBe(created.id);
            expect(retrieved.organizationId).toBe(testOrgId);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /** * Property 13: Frequency validation for income   * 
   * For any income frequency value, the system should accept only one-time, weekly,
   * fortnightly, monthly, or annual values.
   */
  describe("Property 13: Frequency validation for income", () => {
    test("All valid frequency values are accepted", async () => {
      const validFrequencies = ["one-time", "weekly", "fortnightly", "monthly", "annual"] as const;

      for (const frequency of validFrequencies) {
        const created = await incomeService.createIncome(
          testOrgId,
          testUserId,
          {
            type: "Salary",
            name: `Test Income ${frequency}`,
            amount: "1000.00",
            frequency: frequency,
            isNet: false,
          }
        );

        // Property: Valid frequencies should be stored correctly
        expect(created.frequency).toBe(frequency);
      }
    });
  });

  /** * Property 15: Net income calculation treatment   * 
   * For any income marked as net, calculations should treat the amount as post-tax
   * without further deductions.
   */
  describe("Property 15: Net income calculation treatment", () => {
    test("Net income flag is preserved", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (isNet) => {
            const created = await incomeService.createIncome(
              testOrgId,
              testUserId,
              {
                type: "Salary",
                name: "Test Income",
                amount: "2000.00",
                frequency: "monthly",
                isNet,
              }
            );

            // Property: isNet flag should be preserved
            expect(created.isNet).toBe(isNet);

            // Verify it's stored correctly in database
            const retrieved = await incomeService.getIncome(created.id, testOrgId);
            expect(retrieved.isNet).toBe(isNet);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /** * Property 16: Income updates respect organization boundaries   * 
   * For any income update request, the system should update only if the income
   * belongs to the user's organization.
   */
  describe("Property 16: Income updates respect organization boundaries", () => {
    test("User can update income in their organization", async () => {
      // Create income in test organization
      const created = await incomeService.createIncome(
        testOrgId,
        testUserId,
        {
          type: "Salary",
          name: "Original Name",
          amount: "1000.00",
          frequency: "monthly",
          isNet: false,
        }
      );

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }),
            amount: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => n.toFixed(2)),
          }),
          async (updateData) => {
            const updated = await incomeService.updateIncome(
              created.id,
              testOrgId,
              testUserId,
              updateData
            );

            // Property: Update should succeed and reflect changes
            expect(updated.id).toBe(created.id);
            expect(updated.organizationId).toBe(testOrgId);
            expect(updated.name).toBe(updateData.name);
            expect(updated.amount).toBe(updateData.amount);
          }
        ),
        { numRuns: 10 }
      );
    });

    test("User cannot update income from another organization", async () => {
      // Create income in other organization
      const otherIncome = await incomeService.createIncome(
        otherOrgId,
        otherUserId,
        {
          type: "Salary",
          name: "Other Income",
          amount: "1000.00",
          frequency: "monthly",
          isNet: false,
        }
      );

      // Property: Attempting to update income from another org should fail
      try {
        await incomeService.updateIncome(
          otherIncome.id,
          testOrgId, // Wrong organization
          testUserId,
          { name: "Hacked Name" }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
        expect(error.code).toBe("RES_001");
      }

      // Verify income was not modified
      const unchanged = await incomeService.getIncome(otherIncome.id, otherOrgId);
      expect(unchanged.name).toBe("Other Income");
    });

    test("Income from one org is not visible to users from another org", async () => {
      // Create income in test organization
      const testIncome = await incomeService.createIncome(
        testOrgId,
        testUserId,
        {
          type: "Salary",
          name: "Test Income",
          amount: "1000.00",
          frequency: "monthly",
          isNet: false,
        }
      );

      // Property: User from other org cannot access this income
      try {
        await incomeService.getIncome(testIncome.id, otherOrgId);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });

  /** * Property 17: Income deletion triggers recalculation   * 
   * For any income deletion, the system should remove the record and recompute
   * dependent financial projections.
   */
  describe("Property 17: Income deletion triggers recalculation", () => {
    test("Income is deleted and cannot be retrieved", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            type: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            amount: fc.double({ min: 0.01, max: 100000, noNaN: true }).map(n => n.toFixed(2)),
            frequency: fc.constantFrom("weekly", "fortnightly", "monthly", "annual"),
            isNet: fc.boolean(),
          }),
          async (incomeData) => {
            // Create income
            const created = await incomeService.createIncome(
              testOrgId,
              testUserId,
              incomeData
            );

            // Delete income
            await incomeService.deleteIncome(created.id, testOrgId, testUserId);

            // Property: Deleted income should not be retrievable
            try {
              await incomeService.getIncome(created.id, testOrgId);
              expect(true).toBe(false); // Should not reach here
            } catch (error: any) {
              expect(error.statusCode).toBe(404);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test("User cannot delete income from another organization", async () => {
      // Create income in other organization
      const otherIncome = await incomeService.createIncome(
        otherOrgId,
        otherUserId,
        {
          type: "Salary",
          name: "Other Income",
          amount: "1000.00",
          frequency: "monthly",
          isNet: false,
        }
      );

      // Property: Attempting to delete income from another org should fail
      try {
        await incomeService.deleteIncome(
          otherIncome.id,
          testOrgId, // Wrong organization
          testUserId
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }

      // Verify income still exists
      const stillExists = await incomeService.getIncome(otherIncome.id, otherOrgId);
      expect(stillExists.id).toBe(otherIncome.id);
    });

    test("Deletion affects monthly total calculation", async () => {
      // Create multiple incomes
      const income1 = await incomeService.createIncome(
        testOrgId,
        testUserId,
        {
          type: "Salary",
          name: "Income 1",
          amount: "1000.00",
          frequency: "monthly",
          isNet: false,
        }
      );

      const income2 = await incomeService.createIncome(
        testOrgId,
        testUserId,
        {
          type: "Bonus",
          name: "Income 2",
          amount: "500.00",
          frequency: "monthly",
          isNet: false,
        }
      );

      // Get total before deletion
      const totalBefore = await incomeService.getMonthlyTotal(testOrgId);
      expect(totalBefore.toNumber()).toBe(1500);

      // Delete one income
      await incomeService.deleteIncome(income1.id, testOrgId, testUserId);

      // Property: Monthly total should be recalculated
      const totalAfter = await incomeService.getMonthlyTotal(testOrgId);
      expect(totalAfter.toNumber()).toBe(500);
    });
  });

  /** * Property 14: Income frequency normalization   * 
   * For any income with a frequency, converting to monthly equivalent should
   * produce the correct monthly amount based on the frequency.
   */
  describe("Property 14: Income frequency normalization", () => {
    test("Monthly total correctly sums all income frequencies", async () => {
      // Create incomes with different frequencies
      await incomeService.createIncome(testOrgId, testUserId, {
        type: "Salary",
        name: "Monthly Salary",
        amount: "1200.00", // 1200/month
        frequency: "monthly",
        isNet: false,
      });

      await incomeService.createIncome(testOrgId, testUserId, {
        type: "Bonus",
        name: "Annual Bonus",
        amount: "12000.00", // 12000/year = 1000/month
        frequency: "annual",
        isNet: false,
      });

      await incomeService.createIncome(testOrgId, testUserId, {
        type: "Side Job",
        name: "Weekly Income",
        amount: "100.00", // 100/week = 433.33/month (100 * 52 / 12)
        frequency: "weekly",
        isNet: false,
      });

      await incomeService.createIncome(testOrgId, testUserId, {
        type: "Freelance",
        name: "Fortnightly Income",
        amount: "200.00", // 200/fortnight = 433.33/month (200 * 26 / 12)
        frequency: "fortnightly",
        isNet: false,
      });

      await incomeService.createIncome(testOrgId, testUserId, {
        type: "Gift",
        name: "One-time",
        amount: "5000.00", // Should not be included in monthly total
        frequency: "one-time",
        isNet: false,
      });

      // Property: Monthly total should correctly sum all frequencies
      const total = await incomeService.getMonthlyTotal(testOrgId);
      
      // Expected: 1200 + 1000 + 433.33 + 433.33 = 3066.66
      const expected = new Decimal(1200)
        .plus(new Decimal(12000).dividedBy(12))
        .plus(new Decimal(100).times(52).dividedBy(12))
        .plus(new Decimal(200).times(26).dividedBy(12));

      expect(total.toFixed(2)).toBe(expected.toFixed(2));
    });

    test("One-time incomes are excluded from monthly total", async () => {
      await incomeService.createIncome(testOrgId, testUserId, {
        type: "Gift",
        name: "One-time Gift",
        amount: "10000.00",
        frequency: "one-time",
        isNet: false,
      });

      // Property: One-time incomes should not contribute to monthly total
      const total = await incomeService.getMonthlyTotal(testOrgId);
      expect(total.toNumber()).toBe(0);
    });
  });

  /**
   * Additional tests for list functionality
   */
  describe("List and pagination", () => {
    test("listIncomes returns only incomes for the organization", async () => {
      // Create incomes in test org
      await incomeService.createIncome(testOrgId, testUserId, {
        type: "Salary",
        name: "Test Income 1",
        amount: "1000.00",
        frequency: "monthly",
        isNet: false,
      });

      await incomeService.createIncome(testOrgId, testUserId, {
        type: "Bonus",
        name: "Test Income 2",
        amount: "500.00",
        frequency: "monthly",
        isNet: false,
      });

      // Create income in other org
      await incomeService.createIncome(otherOrgId, otherUserId, {
        type: "Salary",
        name: "Other Income",
        amount: "2000.00",
        frequency: "monthly",
        isNet: false,
      });

      // Property: List should only return incomes for the specified organization
      const result = await incomeService.listIncomes(testOrgId);
      
      expect(result.incomes.length).toBe(2);
      expect(result.incomes.every(i => i.organizationId === testOrgId)).toBe(true);
      expect(result.pagination.total).toBe(2);
    });

    test("Pagination works correctly", async () => {
      // Create 5 incomes
      for (let i = 0; i < 5; i++) {
        await incomeService.createIncome(testOrgId, testUserId, {
          type: "Salary",
          name: `Income ${i}`,
          amount: "1000.00",
          frequency: "monthly",
          isNet: false,
        });
      }

      // Get page 1 with limit 2
      const page1 = await incomeService.listIncomes(testOrgId, { page: 1, limit: 2 });
      expect(page1.incomes.length).toBe(2);
      expect(page1.pagination.page).toBe(1);
      expect(page1.pagination.limit).toBe(2);
      expect(page1.pagination.total).toBe(5);

      // Get page 2
      const page2 = await incomeService.listIncomes(testOrgId, { page: 2, limit: 2 });
      expect(page2.incomes.length).toBe(2);
      expect(page2.pagination.page).toBe(2);

      // Get page 3 (should have 1 item)
      const page3 = await incomeService.listIncomes(testOrgId, { page: 3, limit: 2 });
      expect(page3.incomes.length).toBe(1);
    });
  });
});
