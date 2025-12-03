import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { db } from "../../db";
import { debt } from "../../db/schema";
import { debtService } from "../../services/debt.service";
import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import fc from "fast-check";
import {
  createTestContext,
  cleanupTestContext,
  type TestContext,
} from "../helpers/testSetup";
import {
  debtDataArbitrary,
  debtUpdateArbitrary,
  paymentAmountArbitrary,
  moneyAmountArbitrary,
} from "../helpers/generators";

/**
 * Property-Based Tests for Debt Service
 * 
 * Tests the following correctness properties:
 * - Property 24: Debt creation with active status
 * - Property 25: CCJ debts require deadline
 * - Property 26: Payment recording reduces balance
 * - Property 27: Zero balance transitions to paid
 * - Property 28: Status changes are validated and audited
 * - Property 29: Debts ordered by snowball position
 * 
 */

describe("Debt Service - Property Tests", () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await cleanupTestContext(context);
  });

  beforeEach(async () => {
    // Clean up debts before each test
    await db.delete(debt).where(eq(debt.organizationId, context.testOrg.orgId));
    await db.delete(debt).where(eq(debt.organizationId, context.otherOrg.orgId));
  });

  /**
   * Feature: debt-snowball-api, Property 24: Debt creation with active status
   * 
   * For any valid debt data, creating a debt should store it with status of active
   * and all required fields.
   */
  describe("Property 24: Debt creation with active status", () => {
    test("Created debt has active status by default", async () => {
      await fc.assert(
        fc.asyncProperty(debtDataArbitrary, async (debtData) => {
          const created = await debtService.createDebt(
            context.testOrg.orgId,
            context.testOrg.adminUserId,
            debtData
          );

          // Property: Debt must be created with active status
          expect(created.status).toBe("active");
          expect(created.organizationId).toBe(context.testOrg.orgId);
          expect(created.name).toBe(debtData.name);
          expect(created.type).toBe(debtData.type);
          expect(created.balance).toBe(debtData.balance);
          expect(created.interestRate).toBe(debtData.interestRate);
          expect(created.minimumPayment).toBe(debtData.minimumPayment);
          expect(created.isCcj).toBe(debtData.isCcj);
          expect(created.id).toBeDefined();
          expect(created.createdAt).toBeDefined();
        }),
        { numRuns: 20 }
      );
    });

    test("Debt can be retrieved after creation", async () => {
      await fc.assert(
        fc.asyncProperty(debtDataArbitrary, async (debtData) => {
          const created = await debtService.createDebt(
            context.testOrg.orgId,
            context.testOrg.adminUserId,
            debtData
          );

          // Property: Created debt should be retrievable
          const retrieved = await debtService.getDebt(created.id, context.testOrg.orgId);
          expect(retrieved.id).toBe(created.id);
          expect(retrieved.organizationId).toBe(context.testOrg.orgId);
          expect(retrieved.status).toBe("active");
        }),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Feature: debt-snowball-api, Property 25: CCJ debts require deadline
   * 
   * For any debt marked as CCJ, the system should require a CCJ deadline date
   * and reject creation without it.
   */
  describe("Property 25: CCJ debts require deadline", () => {
    test("CCJ debt with deadline is accepted", async () => {
      const ccjDebt = {
        name: "CCJ Debt",
        type: "ccj" as const,
        balance: "5000.00",
        interestRate: "10.00",
        minimumPayment: "100.00",
        isCcj: true,
        ccjDeadline: "2026-06-01",
      };

      const created = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        ccjDebt
      );

      // Property: CCJ debt with deadline should be created successfully
      expect(created.isCcj).toBe(true);
      expect(created.ccjDeadline).toBe("2026-06-01");
    });

    test("CCJ debt without deadline is rejected", async () => {
      const ccjDebtWithoutDeadline = {
        name: "CCJ Debt",
        type: "ccj" as const,
        balance: "5000.00",
        interestRate: "10.00",
        minimumPayment: "100.00",
        isCcj: true,
        ccjDeadline: undefined,
      };

      // Property: CCJ debt without deadline should be rejected
      try {
        await debtService.createDebt(
          context.testOrg.orgId,
          context.testOrg.adminUserId,
          ccjDebtWithoutDeadline as any
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe("DEBT_001");
      }
    });

    test("Non-CCJ debt without deadline is accepted", async () => {
      const nonCcjDebt = {
        name: "Regular Debt",
        type: "loan" as const,
        balance: "3000.00",
        interestRate: "15.00",
        minimumPayment: "75.00",
        isCcj: false,
        ccjDeadline: undefined,
      };

      const created = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        nonCcjDebt
      );

      // Property: Non-CCJ debt without deadline should be accepted
      expect(created.isCcj).toBe(false);
      expect(created.ccjDeadline).toBeNull();
    });
  });

  /**
   * Feature: debt-snowball-api, Property 26: Payment recording reduces balance
   * 
   * For any debt payment, recording it should reduce the debt balance by the
   * payment amount.
   */
  describe("Property 26: Payment recording reduces balance", () => {
    test("Payment reduces balance correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          moneyAmountArbitrary,
          paymentAmountArbitrary,
          async (initialBalance, paymentAmount) => {
            const balance = new Decimal(initialBalance);
            const payment = new Decimal(paymentAmount);

            // Skip if payment would exceed balance
            if (payment.greaterThan(balance)) {
              return;
            }

            // Create debt
            const created = await debtService.createDebt(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                name: "Test Debt",
                type: "loan",
                balance: initialBalance,
                interestRate: "10.00",
                minimumPayment: "50.00",
                isCcj: false,
              }
            );

            // Record payment
            const updated = await debtService.recordPayment(
              created.id,
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              { amount: paymentAmount }
            );

            // Property: Balance should be reduced by payment amount
            const expectedBalance = balance.minus(payment);
            expect(new Decimal(updated.balance).toFixed(2)).toBe(
              expectedBalance.toFixed(2)
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    test("Payment exceeding balance is rejected", async () => {
      const created = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Test Debt",
          type: "loan",
          balance: "100.00",
          interestRate: "10.00",
          minimumPayment: "10.00",
          isCcj: false,
        }
      );

      // Property: Payment exceeding balance should be rejected
      try {
        await debtService.recordPayment(
          created.id,
          context.testOrg.orgId,
          context.testOrg.adminUserId,
          { amount: "150.00" }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe("DEBT_003");
      }
    });
  });

  /**
   * Feature: debt-snowball-api, Property 27: Zero balance transitions to paid
   * 
   * For any debt with balance reaching zero, the system should transition the
   * status to paid and exclude it from active calculations.
   */
  describe("Property 27: Zero balance transitions to paid", () => {
    test("Debt status changes to paid when balance reaches zero", async () => {
      const created = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Test Debt",
          type: "loan",
          balance: "100.00",
          interestRate: "10.00",
          minimumPayment: "10.00",
          isCcj: false,
        }
      );

      // Property: Paying off full balance should transition status to paid
      const updated = await debtService.recordPayment(
        created.id,
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        { amount: "100.00" }
      );

      expect(updated.balance).toBe("0.00");
      expect(updated.status).toBe("paid");
    });

    test("Paid debt is excluded from active debts", async () => {
      // Create two debts
      const debt1 = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Active Debt",
          type: "loan",
          balance: "1000.00",
          interestRate: "10.00",
          minimumPayment: "50.00",
          isCcj: false,
        }
      );

      const debt2 = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Debt to Pay Off",
          type: "credit-card",
          balance: "100.00",
          interestRate: "15.00",
          minimumPayment: "10.00",
          isCcj: false,
        }
      );

      // Pay off debt2
      await debtService.recordPayment(
        debt2.id,
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        { amount: "100.00" }
      );

      // Property: Only active debts should be returned
      const activeDebts = await debtService.getActiveDebts(context.testOrg.orgId);
      expect(activeDebts.length).toBe(1);
      expect(activeDebts[0]?.id).toBe(debt1.id);
    });

    test("Cannot record payment on paid debt", async () => {
      const created = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Test Debt",
          type: "loan",
          balance: "100.00",
          interestRate: "10.00",
          minimumPayment: "10.00",
          isCcj: false,
        }
      );

      // Pay off debt
      await debtService.recordPayment(
        created.id,
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        { amount: "100.00" }
      );

      // Property: Cannot record payment on paid debt
      try {
        await debtService.recordPayment(
          created.id,
          context.testOrg.orgId,
          context.testOrg.adminUserId,
          { amount: "10.00" }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe("DEBT_004");
      }
    });
  });

  /**
   * Feature: debt-snowball-api, Property 28: Status changes are validated and audited
   * 
   * For any debt status change, the system should validate the transition is valid
   * and create an audit log entry.
   */
  describe("Property 28: Status changes are validated and audited", () => {
    test("Cannot modify paid debt", async () => {
      const created = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Test Debt",
          type: "loan",
          balance: "100.00",
          interestRate: "10.00",
          minimumPayment: "10.00",
          isCcj: false,
        }
      );

      // Pay off debt
      await debtService.recordPayment(
        created.id,
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        { amount: "100.00" }
      );

      // Property: Cannot update paid debt
      try {
        await debtService.updateDebt(
          created.id,
          context.testOrg.orgId,
          context.testOrg.adminUserId,
          { name: "Updated Name" }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe("DEBT_004");
      }
    });
  });

  /**
   * Feature: debt-snowball-api, Property 29: Debts ordered by snowball position
   * 
   * For any debt query, the results should be ordered by snowball position.
   */
  describe("Property 29: Debts ordered by snowball position", () => {
    test("listDebts returns debts ordered by snowball position", async () => {
      // Create debts with different snowball positions
      const debt1 = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Debt 1",
          type: "loan",
          balance: "1000.00",
          interestRate: "10.00",
          minimumPayment: "50.00",
          isCcj: false,
        }
      );

      const debt2 = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Debt 2",
          type: "credit-card",
          balance: "500.00",
          interestRate: "15.00",
          minimumPayment: "25.00",
          isCcj: false,
        }
      );

      const debt3 = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Debt 3",
          type: "overdraft",
          balance: "2000.00",
          interestRate: "20.00",
          minimumPayment: "100.00",
          isCcj: false,
        }
      );

      // Manually set snowball positions for testing
      await db
        .update(debt)
        .set({ snowballPosition: 1 })
        .where(eq(debt.id, debt2.id));
      await db
        .update(debt)
        .set({ snowballPosition: 2 })
        .where(eq(debt.id, debt1.id));
      await db
        .update(debt)
        .set({ snowballPosition: 3 })
        .where(eq(debt.id, debt3.id));

      // Property: Debts should be ordered by snowball position
      const result = await debtService.listDebts(context.testOrg.orgId);
      expect(result.debts.length).toBe(3);
      expect(result.debts[0]?.snowballPosition).toBe(1);
      expect(result.debts[1]?.snowballPosition).toBe(2);
      expect(result.debts[2]?.snowballPosition).toBe(3);
    });

    test("getActiveDebts returns debts ordered by snowball position", async () => {
      // Create active debts
      const debt1 = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Debt 1",
          type: "loan",
          balance: "1000.00",
          interestRate: "10.00",
          minimumPayment: "50.00",
          isCcj: false,
        }
      );

      const debt2 = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Debt 2",
          type: "credit-card",
          balance: "500.00",
          interestRate: "15.00",
          minimumPayment: "25.00",
          isCcj: false,
        }
      );

      // Set snowball positions
      await db
        .update(debt)
        .set({ snowballPosition: 2 })
        .where(eq(debt.id, debt1.id));
      await db
        .update(debt)
        .set({ snowballPosition: 1 })
        .where(eq(debt.id, debt2.id));

      // Property: Active debts should be ordered by snowball position
      const activeDebts = await debtService.getActiveDebts(context.testOrg.orgId);
      expect(activeDebts.length).toBe(2);
      expect(activeDebts[0]?.snowballPosition).toBe(1);
      expect(activeDebts[1]?.snowballPosition).toBe(2);
    });
  });

  /**
   * Organization boundary tests
   */
  describe("Organization data isolation", () => {
    test("User can update debt in their organization", async () => {
      const created = await debtService.createDebt(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          name: "Original Name",
          type: "loan",
          balance: "1000.00",
          interestRate: "10.00",
          minimumPayment: "50.00",
          isCcj: false,
        }
      );

      await fc.assert(
        fc.asyncProperty(debtUpdateArbitrary, async (updateData) => {
          const updated = await debtService.updateDebt(
            created.id,
            context.testOrg.orgId,
            context.testOrg.adminUserId,
            updateData
          );

          // Property: Update should succeed and reflect changes
          expect(updated.id).toBe(created.id);
          expect(updated.organizationId).toBe(context.testOrg.orgId);
          expect(updated.name).toBe(updateData.name);
          expect(updated.balance).toBe(updateData.balance);
        }),
        { numRuns: 10 }
      );
    });

    test("User cannot update debt from another organization", async () => {
      const otherDebt = await debtService.createDebt(
        context.otherOrg.orgId,
        context.otherOrg.adminUserId,
        {
          name: "Other Debt",
          type: "loan",
          balance: "1000.00",
          interestRate: "10.00",
          minimumPayment: "50.00",
          isCcj: false,
        }
      );

      try {
        await debtService.updateDebt(
          otherDebt.id,
          context.testOrg.orgId, // Wrong organization
          context.testOrg.adminUserId,
          { name: "Hacked Name" }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
        expect(error.code).toBe("RES_001");
      }

      // Verify debt was not modified
      const unchanged = await debtService.getDebt(otherDebt.id, context.otherOrg.orgId);
      expect(unchanged.name).toBe("Other Debt");
    });

    test("User cannot delete debt from another organization", async () => {
      const otherDebt = await debtService.createDebt(
        context.otherOrg.orgId,
        context.otherOrg.adminUserId,
        {
          name: "Other Debt",
          type: "loan",
          balance: "1000.00",
          interestRate: "10.00",
          minimumPayment: "50.00",
          isCcj: false,
        }
      );

      try {
        await debtService.deleteDebt(
          otherDebt.id,
          context.testOrg.orgId, // Wrong organization
          context.testOrg.adminUserId
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }

      // Verify debt still exists
      const stillExists = await debtService.getDebt(otherDebt.id, context.otherOrg.orgId);
      expect(stillExists.id).toBe(otherDebt.id);
    });

    test("User cannot record payment on debt from another organization", async () => {
      const otherDebt = await debtService.createDebt(
        context.otherOrg.orgId,
        context.otherOrg.adminUserId,
        {
          name: "Other Debt",
          type: "loan",
          balance: "1000.00",
          interestRate: "10.00",
          minimumPayment: "50.00",
          isCcj: false,
        }
      );

      try {
        await debtService.recordPayment(
          otherDebt.id,
          context.testOrg.orgId, // Wrong organization
          context.testOrg.adminUserId,
          { amount: "100.00" }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }

      // Verify debt balance unchanged
      const unchanged = await debtService.getDebt(otherDebt.id, context.otherOrg.orgId);
      expect(unchanged.balance).toBe("1000.00");
    });

    test("listDebts returns only debts for the organization", async () => {
      // Create debts in test org
      await debtService.createDebt(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "Test Debt 1",
        type: "loan",
        balance: "1000.00",
        interestRate: "10.00",
        minimumPayment: "50.00",
        isCcj: false,
      });

      await debtService.createDebt(context.testOrg.orgId, context.testOrg.adminUserId, {
        name: "Test Debt 2",
        type: "credit-card",
        balance: "500.00",
        interestRate: "15.00",
        minimumPayment: "25.00",
        isCcj: false,
      });

      // Create debt in other org
      await debtService.createDebt(context.otherOrg.orgId, context.otherOrg.adminUserId, {
        name: "Other Debt",
        type: "loan",
        balance: "2000.00",
        interestRate: "12.00",
        minimumPayment: "100.00",
        isCcj: false,
      });

      // Property: List should only return debts for the specified organization
      const result = await debtService.listDebts(context.testOrg.orgId);

      expect(result.debts.length).toBe(2);
      expect(result.debts.every((d) => d.organizationId === context.testOrg.orgId)).toBe(true);
      expect(result.pagination.total).toBe(2);
    });
  });
});
