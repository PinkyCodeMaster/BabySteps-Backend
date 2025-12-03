import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { db } from "../../db";
import { babyStep } from "../../db/schema/babySteps";
import { debt } from "../../db/schema/debts";
import { expense } from "../../db/schema/expenses";
import { babyStepsService } from "../../services/babySteps.service";
import { debtService } from "../../services/debt.service";
import { expenseService } from "../../services/expense.service";
import { eq } from "drizzle-orm";
import fc from "fast-check";
import {
  createTestContext,
  cleanupTestContext,
  type TestContext,
} from "../helpers/testSetup";
import { debtDataArbitrary, expenseDataArbitrary } from "../helpers/generators";

/**
 * Property-Based Tests for Baby Steps Service
 * 
 * Tests the following correctness properties:
 * - Property 41: Baby Steps status includes progress data
 * - Property 42: Step 1 progress tracking
 * - Property 43: Step 1 completion allows progression
 * - Property 44: Step 2 requires debt payoff
 * - Property 45: Step 3 progress tracking
 * - Property 46: Baby Steps progress validation
 * - Property 47: Baby Steps feature gating
 * 
 */

describe("Baby Steps Service - Property Tests", () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await cleanupTestContext(context);
  });

  beforeEach(async () => {
    // Clean up baby steps, debts, and expenses before each test
    await db.delete(babyStep).where(eq(babyStep.organizationId, context.testOrg.orgId));
    await db.delete(babyStep).where(eq(babyStep.organizationId, context.otherOrg.orgId));
    await db.delete(debt).where(eq(debt.organizationId, context.testOrg.orgId));
    await db.delete(debt).where(eq(debt.organizationId, context.otherOrg.orgId));
    await db.delete(expense).where(eq(expense.organizationId, context.testOrg.orgId));
    await db.delete(expense).where(eq(expense.organizationId, context.otherOrg.orgId));
  });

  /** * Property 41: Baby Steps status includes progress data
   * 
   * For any Baby Steps query, the response should include current step and progress data
   * including emergency fund amount saved.
   */
  describe("Property 41: Baby Steps status includes progress data", () => {
    test("getCurrentStep returns status with progress data", async () => {
      const status = await babyStepsService.getCurrentStep(context.testOrg.orgId);

      // Property: Status must include current step and progress data
      expect(status.currentStep).toBeDefined();
      expect(status.currentStep).toBeGreaterThanOrEqual(1);
      expect(status.currentStep).toBeLessThanOrEqual(7);
      expect(status.stepProgress).toBeDefined();
      expect(status.organizationId).toBe(context.testOrg.orgId);
      expect(status.updatedAt).toBeDefined();
    });

    test("Status includes emergency fund saved when set", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0, max: 10000 }),
          async (emergencyFundSaved) => {
            // Update progress with emergency fund amount
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                stepProgress: { emergencyFundSaved },
              }
            );

            // Get status
            const status = await babyStepsService.getCurrentStep(context.testOrg.orgId);

            // Property: Progress data must include emergency fund saved
            expect(status.stepProgress).toBeDefined();
            const progress = status.stepProgress as any;
            expect(progress.emergencyFundSaved).toBe(emergencyFundSaved);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /** * Property 42: Step 1 progress tracking
   * 
   * For any organization on step 1, the system should track progress toward
   * the starter emergency fund target amount.
   */
  describe("Property 42: Step 1 progress tracking", () => {
    test("Step 1 tracks emergency fund progress", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0, max: 2000, noNaN: true }),
          async (emergencyFundSaved) => {
            // Ensure on step 1
            const status = await babyStepsService.getCurrentStep(context.testOrg.orgId);
            expect(status.currentStep).toBe(1);

            // Update progress
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                stepProgress: { emergencyFundSaved },
              }
            );

            // Get updated status
            const updated = await babyStepsService.getCurrentStep(context.testOrg.orgId);

            // Property: Step 1 must track emergency fund saved
            const progress = updated.stepProgress as any;
            expect(progress.emergencyFundSaved).toBe(emergencyFundSaved);
            expect(updated.currentStep).toBe(1);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /** * Property 43: Step 1 completion allows progression
   * 
   * For any organization completing the step 1 emergency fund target,
   * the system should allow progression to step 2.
   */
  describe("Property 43: Step 1 completion allows progression", () => {
    test.skip("Can advance to step 2 when emergency fund >= 1000", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 1000, max: 5000 }),
          async (emergencyFundSaved) => {
            // Set emergency fund to target or above
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                stepProgress: { emergencyFundSaved },
              }
            );

            // Property: Should be able to advance to step 2
            const canAdvance = await babyStepsService.canAdvanceToStep(
              context.testOrg.orgId,
              2
            );
            expect(canAdvance).toBe(true);

            // Should be able to actually advance
            const updated = await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                currentStep: 2,
              }
            );
            expect(updated.currentStep).toBe(2);
          }
        ),
        { numRuns: 20 }
      );
    });

    test.skip("Cannot advance to step 2 when emergency fund < 1000", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0, max: 999.99 }),
          async (emergencyFundSaved) => {
            // Set emergency fund below target
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                stepProgress: { emergencyFundSaved },
              }
            );

            // Property: Should NOT be able to advance to step 2
            const canAdvance = await babyStepsService.canAdvanceToStep(
              context.testOrg.orgId,
              2
            );
            expect(canAdvance).toBe(false);

            // Attempting to advance should throw error
            await expect(
              babyStepsService.updateProgress(
                context.testOrg.orgId,
                context.testOrg.adminUserId,
                {
                  currentStep: 2,
                }
              )
            ).rejects.toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /** * Property 44: Step 2 requires debt payoff
   * 
   * For any organization on step 2, advancing to step 3 should be blocked
   * until all debts except mortgage are paid.
   */
  describe("Property 44: Step 2 requires debt payoff", () => {
    test.skip("Cannot advance to step 3 with active debts", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(debtDataArbitrary, { minLength: 1, maxLength: 3 }),
          async (debtsData) => {
            // Clean up first
            await db.delete(babyStep).where(eq(babyStep.organizationId, context.testOrg.orgId));
            await db.delete(debt).where(eq(debt.organizationId, context.testOrg.orgId));

            // Advance to step 2 first
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                currentStep: 1,
                stepProgress: { emergencyFundSaved: 1000 },
              }
            );
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                currentStep: 2,
              }
            );

            // Create active debts
            for (const debtData of debtsData) {
              await debtService.createDebt(
                context.testOrg.orgId,
                context.testOrg.adminUserId,
                debtData
              );
            }

            // Property: Should NOT be able to advance to step 3 with active debts
            const canAdvance = await babyStepsService.canAdvanceToStep(
              context.testOrg.orgId,
              3
            );
            expect(canAdvance).toBe(false);

            // Attempting to advance should throw error
            await expect(
              babyStepsService.updateProgress(
                context.testOrg.orgId,
                context.testOrg.adminUserId,
                {
                  currentStep: 3,
                }
              )
            ).rejects.toThrow();
          }
        ),
        { numRuns: 5 }
      );
    });

    test("Can advance to step 3 when all debts are paid", async () => {
      // Advance to step 2 first
      await babyStepsService.updateProgress(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          currentStep: 1,
          stepProgress: { emergencyFundSaved: 1000 },
        }
      );
      await babyStepsService.updateProgress(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          currentStep: 2,
        }
      );

      // No active debts
      // Property: Should be able to advance to step 3
      const canAdvance = await babyStepsService.canAdvanceToStep(
        context.testOrg.orgId,
        3
      );
      expect(canAdvance).toBe(true);

      // Should be able to actually advance
      const updated = await babyStepsService.updateProgress(
        context.testOrg.orgId,
        context.testOrg.adminUserId,
        {
          currentStep: 3,
        }
      );
      expect(updated.currentStep).toBe(3);
    });
  });

  /** * Property 45: Step 3 progress tracking
   * 
   * For any organization on step 3, the system should track progress toward
   * the full emergency fund target of three to six months expenses.
   */
  describe("Property 45: Step 3 progress tracking", () => {
    test("Step 3 tracks emergency fund and target months", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0, max: 50000 }),
          fc.integer({ min: 3, max: 6 }),
          async (emergencyFundSaved, targetMonths) => {
            // Clean up first
            await db.delete(babyStep).where(eq(babyStep.organizationId, context.testOrg.orgId));
            await db.delete(debt).where(eq(debt.organizationId, context.testOrg.orgId));

            // Advance to step 3 (ensure no debts for step 2 completion)
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                currentStep: 1,
                stepProgress: { emergencyFundSaved: 1000 },
              }
            );
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                currentStep: 2,
              }
            );
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                currentStep: 3,
              }
            );

            // Update progress with emergency fund and target months
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                stepProgress: { emergencyFundSaved, targetMonths },
              }
            );

            // Get updated status
            const updated = await babyStepsService.getCurrentStep(context.testOrg.orgId);

            // Property: Step 3 must track emergency fund saved and target months
            const progress = updated.stepProgress as any;
            expect(progress.emergencyFundSaved).toBe(emergencyFundSaved);
            expect(progress.targetMonths).toBe(targetMonths);
            expect(updated.currentStep).toBe(3);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /** * Property 46: Baby Steps progress validation
   * 
   * For any Baby Steps progress update, the system should validate it against
   * step requirements before storing.
   */
  describe("Property 46: Baby Steps progress validation", () => {
    test("Rejects negative emergency fund amounts", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: -10000, max: -0.01, noNaN: true }),
          async (negativeAmount) => {
            // Property: Negative emergency fund should be rejected
            await expect(
              babyStepsService.updateProgress(
                context.testOrg.orgId,
                context.testOrg.adminUserId,
                {
                  stepProgress: { emergencyFundSaved: negativeAmount },
                }
              )
            ).rejects.toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });

    test("Rejects target months outside 3-6 range", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ min: -100, max: 2 }),
            fc.integer({ min: 7, max: 100 })
          ),
          async (invalidMonths) => {
            // Property: Target months outside 3-6 should be rejected
            await expect(
              babyStepsService.updateProgress(
                context.testOrg.orgId,
                context.testOrg.adminUserId,
                {
                  stepProgress: { targetMonths: invalidMonths },
                }
              )
            ).rejects.toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });

    test("Rejects skipping steps", async () => {
      // On step 1, try to jump to step 3
      await expect(
        babyStepsService.updateProgress(
          context.testOrg.orgId,
          context.testOrg.adminUserId,
          {
            currentStep: 3,
          }
        )
      ).rejects.toThrow();
    });

    test("Accepts valid progress updates", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0, max: 10000, noNaN: true }),
          async (emergencyFundSaved) => {
            // Property: Valid progress updates should be accepted
            const updated = await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                stepProgress: { emergencyFundSaved },
              }
            );

            expect(updated).toBeDefined();
            const progress = updated.stepProgress as any;
            expect(progress.emergencyFundSaved).toBe(emergencyFundSaved);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /** * Property 47: Baby Steps feature gating
   * 
   * For any feature gated by Baby Steps, the system should enforce gating rules
   * based on current step.
   */
  describe("Property 47: Baby Steps feature gating", () => {
    test("Feature availability based on current step", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 7 }),
          fc.integer({ min: 1, max: 7 }),
          async (currentStep, requiredStep) => {
            // Clean up first
            await db.delete(babyStep).where(eq(babyStep.organizationId, context.testOrg.orgId));
            await db.delete(debt).where(eq(debt.organizationId, context.testOrg.orgId));

            // Set current step (with proper progression)
            let step = 1;
            await babyStepsService.updateProgress(
              context.testOrg.orgId,
              context.testOrg.adminUserId,
              {
                currentStep: 1,
                stepProgress: { emergencyFundSaved: 1000 },
              }
            );

            while (step < currentStep) {
              step++;
              await babyStepsService.updateProgress(
                context.testOrg.orgId,
                context.testOrg.adminUserId,
                {
                  currentStep: step,
                }
              );
            }

            // Check feature availability
            const isAvailable = await babyStepsService.isFeatureAvailable(
              context.testOrg.orgId,
              requiredStep
            );

            // Property: Feature is available if current step >= required step
            expect(isAvailable).toBe(currentStep >= requiredStep);
          }
        ),
        { numRuns: 10 }
      );
    });

    test("Features requiring step 1 are always available", async () => {
      const isAvailable = await babyStepsService.isFeatureAvailable(
        context.testOrg.orgId,
        1
      );
      expect(isAvailable).toBe(true);
    });

    test("Features requiring higher steps are not available initially", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 7 }),
          async (requiredStep) => {
            // On step 1 by default
            const isAvailable = await babyStepsService.isFeatureAvailable(
              context.testOrg.orgId,
              requiredStep
            );

            // Property: Features requiring higher steps should not be available
            expect(isAvailable).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Additional tests for step requirements
   */
  describe("Step Requirements", () => {
    test("getStepRequirements returns valid requirements for all steps", () => {
      for (let step = 1; step <= 7; step++) {
        const req = babyStepsService.getStepRequirements(step);
        expect(req.step).toBe(step);
        expect(req.name).toBeDefined();
        expect(req.description).toBeDefined();
        expect(req.completionCriteria).toBeDefined();
      }
    });

    test("getStepRequirements rejects invalid step numbers", () => {
      expect(() => babyStepsService.getStepRequirements(0)).toThrow();
      expect(() => babyStepsService.getStepRequirements(8)).toThrow();
      expect(() => babyStepsService.getStepRequirements(-1)).toThrow();
    });
  });
});
