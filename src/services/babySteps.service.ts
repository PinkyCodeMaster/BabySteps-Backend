import { db } from "../db";
import { babyStep } from "../db/schema/babySteps";
import { debt } from "../db/schema/debts";
import { eq, and } from "drizzle-orm";
import { auditService } from "./audit.service";
import { expenseService } from "./expense.service";
import { AppError, ErrorCodes } from "../middleware/errorHandler.middleware";
import Decimal from "decimal.js";
import type { UpdateBabyStepsInput, StepProgress } from "../db/schema/babySteps";

/**
 * Baby Steps Service
 * 
 * Provides business logic for Baby Steps progress tracking.
 * Implements Dave Ramsey's 7-step financial framework with validation
 * and completion criteria checking.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

/**
 * Step requirement definition
 */
interface StepRequirement {
  step: number;
  name: string;
  description: string;
  completionCriteria: (data: {
    stepProgress: StepProgress;
    activeDebts: number;
    monthlyExpenses: Decimal;
  }) => boolean;
}

/**
 * Step requirements for all 7 Baby Steps
 */
const STEP_REQUIREMENTS: StepRequirement[] = [
  {
    step: 1,
    name: "Starter Emergency Fund",
    description: "Save £1,000 for emergencies",
    completionCriteria: (data) => {
      const saved = data.stepProgress.emergencyFundSaved || 0;
      return saved >= 1000;
    },
  },
  {
    step: 2,
    name: "Pay Off All Debt",
    description: "Pay off all debt (except mortgage) using the debt snowball method",
    completionCriteria: (data) => {
      return data.activeDebts === 0;
    },
  },
  {
    step: 3,
    name: "Full Emergency Fund",
    description: "Save 3-6 months of expenses in a fully funded emergency fund",
    completionCriteria: (data) => {
      const saved = data.stepProgress.emergencyFundSaved || 0;
      const targetMonths = data.stepProgress.targetMonths || 3;
      const target = data.monthlyExpenses.times(targetMonths).toNumber();
      return saved >= target;
    },
  },
  {
    step: 4,
    name: "Invest 15% for Retirement",
    description: "Invest 15% of household income into retirement accounts",
    completionCriteria: () => true, // Manual progression
  },
  {
    step: 5,
    name: "Save for Children's Education",
    description: "Save for your children's college fund",
    completionCriteria: () => true, // Manual progression
  },
  {
    step: 6,
    name: "Pay Off Mortgage",
    description: "Pay off your home mortgage early",
    completionCriteria: () => true, // Manual progression
  },
  {
    step: 7,
    name: "Build Wealth and Give",
    description: "Build wealth and give generously",
    completionCriteria: () => true, // Manual progression
  },
];

export class BabyStepsService {
  /**
   * Get current Baby Steps status for an organization
   * 
   * Returns the current step and progress data including emergency fund amount saved.
   * Creates a default Baby Steps record if one doesn't exist.
   * 
   * @param orgId - Organization ID
   * @returns Baby Steps status
   * 
   * Requirements: 8.1
   * Property 41: Baby Steps status includes progress data
   */
  async getCurrentStep(orgId: string): Promise<typeof babyStep.$inferSelect> {
    // Try to fetch existing Baby Steps record
    const [existing] = await db
      .select()
      .from(babyStep)
      .where(eq(babyStep.organizationId, orgId))
      .limit(1);

    // If exists, return it
    if (existing) {
      return existing;
    }

    // Create default Baby Steps record (Step 1, no progress)
    const id = crypto.randomUUID();
    const [created] = await db
      .insert(babyStep)
      .values({
        id,
        organizationId: orgId,
        currentStep: 1,
        stepProgress: {},
      })
      .returning();

    if (!created) {
      throw new AppError(
        ErrorCodes.SRV_INTERNAL_ERROR,
        "Failed to create Baby Steps record",
        500
      );
    }

    return created;
  }

  /**
   * Update Baby Steps progress
   * 
   * Updates progress with validation against step requirements.
   * Validates that step transitions are valid based on completion criteria.
   * 
   * @param orgId - Organization ID
   * @param userId - User ID making the update
   * @param data - Update data (currentStep and/or stepProgress)
   * @returns Updated Baby Steps status
   * @throws {AppError} if validation fails or step requirements not met
   * 
   * Requirements: 8.6
   * Property 46: Baby Steps progress validation
   */
  async updateProgress(
    orgId: string,
    userId: string,
    data: UpdateBabyStepsInput
  ): Promise<typeof babyStep.$inferSelect> {
    // Get current status
    const current = await this.getCurrentStep(orgId);

    // If trying to advance to a new step, validate completion criteria
    if (data.currentStep && data.currentStep > current.currentStep) {
      const canAdvance = await this.canAdvanceToStep(orgId, data.currentStep);
      if (!canAdvance) {
        const previousStep = STEP_REQUIREMENTS[data.currentStep - 2];
        throw new AppError(
          ErrorCodes.VAL_INVALID_INPUT,
          `Cannot advance to step ${data.currentStep}. Complete step ${previousStep?.step}: ${previousStep?.name}`,
          400
        );
      }
    }

    // Validate step progress data
    if (data.stepProgress) {
      // Validate emergencyFundSaved is non-negative
      if (
        data.stepProgress.emergencyFundSaved !== undefined &&
        data.stepProgress.emergencyFundSaved < 0
      ) {
        throw new AppError(
          ErrorCodes.VAL_INVALID_INPUT,
          "Emergency fund saved cannot be negative",
          400
        );
      }

      // Validate targetMonths is between 3 and 6
      if (
        data.stepProgress.targetMonths !== undefined &&
        (data.stepProgress.targetMonths < 3 || data.stepProgress.targetMonths > 6)
      ) {
        throw new AppError(
          ErrorCodes.VAL_INVALID_INPUT,
          "Target months must be between 3 and 6",
          400
        );
      }
    }

    // Merge progress data
    const updatedProgress = {
      ...(current.stepProgress as StepProgress),
      ...data.stepProgress,
    };

    // Update Baby Steps record
    const [updated] = await db
      .update(babyStep)
      .set({
        currentStep: data.currentStep ?? current.currentStep,
        stepProgress: updatedProgress,
      })
      .where(eq(babyStep.organizationId, orgId))
      .returning();

    if (!updated) {
      throw new AppError(
        ErrorCodes.SRV_INTERNAL_ERROR,
        "Failed to update Baby Steps progress",
        500
      );
    }

    // Log update
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "BABY_STEPS_UPDATED",
      affectedRecordIds: [updated.id],
      metadata: {
        previousStep: current.currentStep,
        newStep: updated.currentStep,
        progressUpdate: data.stepProgress,
      },
    });

    return updated;
  }

  /**
   * Check if organization can advance to a target step
   * 
   * Checks completion criteria for the previous step to determine
   * if advancement is allowed.
   * 
   * @param orgId - Organization ID
   * @param targetStep - Target step number (2-7)
   * @returns True if can advance, false otherwise
   * 
   * Requirements: 8.2, 8.3, 8.4, 8.5
   * Property 42: Step 1 progress tracking
   * Property 43: Step 1 completion allows progression
   * Property 44: Step 2 requires debt payoff
   * Property 45: Step 3 progress tracking
   */
  async canAdvanceToStep(orgId: string, targetStep: number): Promise<boolean> {
    // Can't advance to step 1 (it's the starting step)
    if (targetStep <= 1) {
      return false;
    }

    // Can't advance beyond step 7
    if (targetStep > 7) {
      return false;
    }

    // Get current status
    const current = await this.getCurrentStep(orgId);

    // Can only advance one step at a time
    if (targetStep > current.currentStep + 1) {
      return false;
    }

    // Check completion criteria for the previous step
    const previousStepIndex = targetStep - 2; // Array is 0-indexed
    const previousStepReq = STEP_REQUIREMENTS[previousStepIndex];

    if (!previousStepReq) {
      return false;
    }

    // Gather data needed for completion criteria
    const stepProgress = current.stepProgress as StepProgress;

    // Get active debts count (non-mortgage debts)
    const activeDebts = await db
      .select()
      .from(debt)
      .where(
        and(
          eq(debt.organizationId, orgId),
          eq(debt.status, "active")
          // Note: We don't have a mortgage flag, so we count all active debts
          // In a real implementation, you'd filter out mortgage debts
        )
      );

    // Get monthly expenses
    const monthlyExpenses = await expenseService.getMonthlyTotal(orgId, false);

    // Check completion criteria
    return previousStepReq.completionCriteria({
      stepProgress,
      activeDebts: activeDebts.length,
      monthlyExpenses,
    });
  }

  /**
   * Get step requirements for a specific step
   * 
   * Returns the requirements and completion criteria for a given step.
   * 
   * @param step - Step number (1-7)
   * @returns Step requirement details
   * @throws {AppError} if step number is invalid
   * 
   * Requirements: 8.1
   */
  getStepRequirements(step: number): StepRequirement {
    if (step < 1 || step > 7) {
      throw new AppError(
        ErrorCodes.VAL_INVALID_INPUT,
        "Step number must be between 1 and 7",
        400
      );
    }

    return STEP_REQUIREMENTS[step - 1]!;
  }

  /**
   * Check if a feature is gated by Baby Steps
   * 
   * Determines if a feature should be available based on the current step.
   * This can be used to enforce feature gating rules.
   * 
   * @param orgId - Organization ID
   * @param requiredStep - Minimum step required for the feature
   * @returns True if feature is available, false otherwise
   * 
   * Requirements: 8.7
   * Property 47: Baby Steps feature gating
   */
  async isFeatureAvailable(
    orgId: string,
    requiredStep: number
  ): Promise<boolean> {
    const current = await this.getCurrentStep(orgId);
    return current.currentStep >= requiredStep;
  }
}

// Export singleton instance
export const babyStepsService = new BabyStepsService();
