import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { db } from "../../db";
import { expense } from "../../db/schema";
import { expenseService } from "../../services/expense.service";
import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import fc from "fast-check";
import {
  createTestContext,
  cleanupTestContext,
  type TestContext,
} from "../helpers/testSetup";
import {
  expenseDataArbitrary,
  expenseUpdateArbitrary,
  frequencyArbitrary,
  expenseCategoryArbitrary,
  expensePriorityArbitrary,
} from "../helpers/generators";

/**
 * Property-Based Tests for Expense Service
 * 
 * Tests the following correctness properties:
 * - Property 18: Expense creation with organization association
 * - Property 19: Expense category validation
 * - Property 20: Expense priority validation
 * - Property 21: Expense frequency normalization
 * - Property 22: UC-paid expenses excluded from calculations
 * - Property 23: Due day storage
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

describe("Expense Service - Property Tests", () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await cleanupTestContext(context);
  });

  beforeEach(async () => {
    // Clean up expenses before each test
    await db.delete(expense).where(eq(expense.organizationId, context.testOrg.orgId));
    await db.delete(expense).where(eq(expense.organizationId, context.otherOrg.orgId));
  });

  /**
   * Feature: debt-snowball-api, Property 18: Expense creation with organization association
   * Validates: Requirements 4.1
   * 
   * For any valid expense data, creating an expense should store it with the user's
   * organization ID and all required fields validated.
   */
  describe("Property 18: Expense creation with organization association", () => {
    test("Created expense is associated with correct organization", async () => {
      await fc.assert(
        fc.asyncProperty(expenseDataArbitrary, async (expenseData) => {
          const created = await expenseService.createExpense(
            context.testOrg.orgId,
            context.testOrg.adminUserId,
            expenseData
          );

          // Property: Expense must be associated with the correct organization
          expect(created.organizationId).toBe(context.testOrg.orgId);
          expect(created.name).toBe(expenseData.name);
          expect(created.amount).toBe(expenseData.amount);
          expect(created.category).toBe(expenseData.category);
          expect(created.priority).toBe(expenseData.priority);
          expect(created.frequency).toBe(expenseData.frequency);
          expect(created.isUcPaid).toBe(expenseData.isUcPaid);
          expect(created.dueDay).toBe(expenseData.dueDay ?? null);
          expect(created.id).toBeDefined();
          expect(created.createdAt).toBeDefined();
        }),
        { numRuns: 20 }
      );
    });

    test("Expense can be retrieved after creation", async () => {
      await fc.assert(
        fc.asyncProperty(expenseDataArbitrary, async (expenseData) => {
          const created = await expenseService.createExpense(
            context.testOrg.orgId,
            context.testOrg.adminUserId,
            expenseData
          );

          // Property: Created expense should be retrievable
          const retrieved = await expenseService.getExpense(created.id, context.testOrg.orgId);
          expect(retrieved.id).toBe(created.id);
          expect(retrieved.organizationId).toBe(context.testOrg.orgId);
        }),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Feature: debt-snowball-api, Property 19: Expense category validation
   * Validates: Requirements 4.2
   * 
   * For any expense category value, the system should accept only housing, utilities,
   * food, transport, insurance, childcare, or other.
   */
  describe("Property 19: Expense category validation", () => {
    test("All valid category values are accepted", async () => {
      const validCategories = ["housing", "utilities", "food", "transport", "insurance", "childcare", "other"];

      for (const category of validCategories) {
        const created = await expenseService.createExpense(
          context.testOrg.orgId,
          context.testOrg.adminUserId,
          {
            name: `Test Expense ${category}`,
            amount: "100.00",
            category: category as any,
            priority: "essential",
            frequency: "monthly",
            isUcPaid: false,
          }
        );

        // Property: Valid categories should be stored correctly
        expect(created.category).toBe(category);
      }
    });
  });

  /**
   * Feature: debt-snowball-api, Property 20: Expense priority validation
   * Validates: Requirements 4.3
   * 
   * For any expense priority value, the system should accept only essential,
   * important, or discretionary.
   */
  describe("Property 20: Expense priority validation", () => {
    test("All valid priority values are accepted", async () => {
      const validPriorities = ["essential", "important", "discretionary"];

      for (const priority of validPriorities) {
        const created = await expenseService.createExpense(
          context.testOrg.orgId,
          context.testOrg.adminUserId,
          {
            name: `Test Expense ${priority}`,
            amount: "100.00",
            category: "other",
            priority: priority as any,
            frequency: "monthly",
            isUcPaid: false,
          }
        );

        // Property: Valid priorities should be stored correctly
        expect(created.priority).toBe(priority);
      }
    });
  });

  /**
   * Feature: debt-snowball-api, Property 22: UC-paid expenses excluded from calculations
   * Validates: Requirements 4.5
   * 
   * For any expense marked as UC-paid, disposable income calculations should exclude it.
   */
  describe("Property 22: UC-paid expenses excluded from calculations", () => {
    test("UC-paid flag is preserved", async () => {
      await fc.assert(
        fc.asyncProperty(fc.boolean(), async (isUcPaid) => {
          const created = await expenseService.createExpense(
            context.testOrg.orgId,
            context.testOrg.adminUserId,
            {
              name: "Test Expense",
              amount: "200.00",
              category: "housing",
              priority: "essential",
              frequency: "monthly",
              isUcPaid,
            }
          );

          // Property: isUcPaid flag should be preserved
          expect(created.isUcPaid).toBe(isUcPaid);

          // Verify it's stored correctly in database
          const retrieved = await expenseService.getExpense(created.id, context.testOrg.orgId);
          expect(retrieved.isUcPaid).toBe(isUcPaid);
        }),
        { numRuns: 20 }
      );
    });

    test("UC-paid expenses are excluded when requested", async () => {
      // Create UC-paid expense
      await expenseService.createExpense(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "UC-paid Rent",
          amount: "500.00",
          category: "housing",
          priority: "essential",
          frequency: "monthly",
          isUcPaid: true,
        }
      );

      // Create non-UC-paid expense
      await expenseService.createExpense(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Food",
          amount: "300.00",
          category: "food",
          priority: "essential",
          frequency: "monthly",
          isUcPaid: false,
        }
      );

      // Property: Total with UC-paid excluded should only include non-UC-paid expenses
      const totalWithUc = await expenseService.getMonthlyTotal(context.testOrg.orgId, false);
      const totalWithoutUc = await expenseService.getMonthlyTotal(context.testOrg.orgId, true);

      expect(totalWithUc.toNumber()).toBe(800); // 500 + 300
      expect(totalWithoutUc.toNumber()).toBe(300); // Only non-UC-paid
    });
  });

  /**
   * Feature: debt-snowball-api, Property 23: Due day storage
   * Validates: Requirements 4.6
   * 
   * For any expense with a due day specified, the system should store the day of
   * month (1-31) for payment scheduling.
   */
  describe("Property 23: Due day storage", () => {
    test("Due day is stored correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 31 }),
          async (dueDay) => {
            const created = await expenseService.createExpense(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                name: "Test Expense",
                amount: "100.00",
                category: "utilities",
                priority: "essential",
                frequency: "monthly",
                isUcPaid: false,
                dueDay,
              }
            );

            // Property: Due day should be stored correctly
            expect(created.dueDay).toBe(dueDay);
          }
        ),
        { numRuns: 20 }
      );
    });

    test("Expense without due day stores null", async () => {
      const created = await expenseService.createExpense(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Test Expense",
          amount: "100.00",
          category: "other",
          priority: "discretionary",
          frequency: "monthly",
          isUcPaid: false,
        }
      );

      // Property: Missing due day should be stored as null
      expect(created.dueDay).toBeNull();
    });
  });

  /**
   * Feature: debt-snowball-api, Property 21: Expense frequency normalization
   * Validates: Requirements 4.4
   * 
   * For any expense with a frequency, converting to monthly equivalent should
   * produce the correct monthly amount based on the frequency.
   */
  describe("Property 21: Expense frequency normalization", () => {
    test("Monthly total correctly sums all expense frequencies", async () => {
      // Create expenses with different frequencies
      await expenseService.createExpense(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "Monthly Rent",
        amount: "1000.00", // 1000/month
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
      });

      await expenseService.createExpense(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "Annual Insurance",
        amount: "1200.00", // 1200/year = 100/month
        category: "insurance",
        priority: "essential",
        frequency: "annual",
        isUcPaid: false,
      });

      await expenseService.createExpense(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "Weekly Groceries",
        amount: "50.00", // 50/week = 216.67/month (50 * 52 / 12)
        category: "food",
        priority: "essential",
        frequency: "weekly",
        isUcPaid: false,
      });

      await expenseService.createExpense(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "Fortnightly Transport",
        amount: "100.00", // 100/fortnight = 216.67/month (100 * 26 / 12)
        category: "transport",
        priority: "important",
        frequency: "fortnightly",
        isUcPaid: false,
      });

      await expenseService.createExpense(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "One-time Purchase",
        amount: "5000.00", // Should not be included in monthly total
        category: "other",
        priority: "discretionary",
        frequency: "one-time",
        isUcPaid: false,
      });

      // Property: Monthly total should correctly sum all frequencies
      const total = await expenseService.getMonthlyTotal(context.testOrg.orgId);

      // Expected: 1000 + 100 + 216.67 + 216.67 = 1533.34
      const expected = new Decimal(1000)
        .plus(new Decimal(1200).dividedBy(12))
        .plus(new Decimal(50).times(52).dividedBy(12))
        .plus(new Decimal(100).times(26).dividedBy(12));

      expect(total.toFixed(2)).toBe(expected.toFixed(2));
    });

    test("One-time expenses are excluded from monthly total", async () => {
      await expenseService.createExpense(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "One-time Purchase",
        amount: "10000.00",
        category: "other",
        priority: "discretionary",
        frequency: "one-time",
        isUcPaid: false,
      });

      // Property: One-time expenses should not contribute to monthly total
      const total = await expenseService.getMonthlyTotal(context.testOrg.orgId);
      expect(total.toNumber()).toBe(0);
    });
  });

  /**
   * Organization boundary tests
   */
  describe("Organization data isolation", () => {
    test("User can update expense in their organization", async () => {
      const created = await expenseService.createExpense(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Original Name",
          amount: "100.00",
          category: "other",
          priority: "discretionary",
          frequency: "monthly",
          isUcPaid: false,
        }
      );

      await fc.assert(
        fc.asyncProperty(expenseUpdateArbitrary, async (updateData) => {
          const updated = await expenseService.updateExpense(
            created.id,
            context.testOrg.orgId,
            context.testOrg.adminUserId,
            updateData
          );

          // Property: Update should succeed and reflect changes
          expect(updated.id).toBe(created.id);
          expect(updated.organizationId).toBe(context.testOrg.orgId);
          expect(updated.name).toBe(updateData.name);
          expect(updated.amount).toBe(updateData.amount);
        }),
        { numRuns: 10 }
      );
    });

    test("User cannot update expense from another organization", async () => {
      const otherExpense = await expenseService.createExpense(
        context.otherOrg.orgId,
        context.otherOrg.adminUserId,
        {
          name: "Other Expense",
          amount: "100.00",
          category: "other",
          priority: "discretionary",
          frequency: "monthly",
          isUcPaid: false,
        }
      );

      try {
        await expenseService.updateExpense(
          otherExpense.id,
          context.testOrg.orgId, // Wrong organization
          context.testOrg.adminUserId,
          { name: "Hacked Name" }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
        expect(error.code).toBe("RES_001");
      }

      // Verify expense was not modified
      const unchanged = await expenseService.getExpense(otherExpense.id, context.otherOrg.orgId);
      expect(unchanged.name).toBe("Other Expense");
    });

    test("User cannot delete expense from another organization", async () => {
      const otherExpense = await expenseService.createExpense(
        context.otherOrg.orgId,
        context.otherOrg.adminUserId,
        {
          name: "Other Expense",
          amount: "100.00",
          category: "other",
          priority: "discretionary",
          frequency: "monthly",
          isUcPaid: false,
        }
      );

      try {
        await expenseService.deleteExpense(
          otherExpense.id,
          context.testOrg.orgId, // Wrong organization
          context.testOrg.adminUserId
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }

      // Verify expense still exists
      const stillExists = await expenseService.getExpense(otherExpense.id, context.otherOrg.orgId);
      expect(stillExists.id).toBe(otherExpense.id);
    });

    test("listExpenses returns only expenses for the organization", async () => {
      // Create expenses in test org
      await expenseService.createExpense(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "Test Expense 1",
        amount: "100.00",
        category: "food",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
      });

      await expenseService.createExpense(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "Test Expense 2",
        amount: "50.00",
        category: "transport",
        priority: "important",
        frequency: "weekly",
        isUcPaid: false,
      });

      // Create expense in other org
      await expenseService.createExpense(context.otherOrg.orgId, context.otherOrg.adminUserId, {
        name: "Other Expense",
        amount: "200.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
      });

      // Property: List should only return expenses for the specified organization
      const result = await expenseService.listExpenses(context.testOrg.orgId);

      expect(result.expenses.length).toBe(2);
      expect(result.expenses.every((e) => e.organizationId === context.testOrg.orgId)).toBe(true);
      expect(result.pagination.total).toBe(2);
    });
  });
});
