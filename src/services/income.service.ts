import { db } from "../db";
import { income } from "../db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { auditService } from "./audit.service";
import { snowballService } from "./snowball.service";
import { AppError, ErrorCodes } from "../middleware/errorHandler.middleware";
import { toMonthlyEquivalent, type Frequency } from "../utils/frequency";
import Decimal from "decimal.js";
import type { CreateIncomeInput, UpdateIncomeInput } from "../db/schema/incomes";

/**
 * Income Service
 * 
 * Provides business logic for income management operations.
 * Handles CRUD operations with organization filtering, frequency conversion,
 * and recalculation triggers.
 * 
 *
 */
export class IncomeService {
  /**
   * Create a new income record
   * 
   * Creates an income associated with the user's organization.
   * All required fields are validated via Zod schema before reaching this service.
   * 
   * @param orgId - Organization ID
   * @param userId - User ID creating the income
   * @param data - Income data
   * @returns Created income record
   * 
   */
  async createIncome(
    orgId: string,
    userId: string,
    data: CreateIncomeInput
  ): Promise<typeof income.$inferSelect> {
    // Generate ID
    const id = crypto.randomUUID();

    // Insert income
    const [created] = await db
      .insert(income)
      .values({
        id,
        organizationId: orgId,
        ...data,
      })
      .returning();

    if (!created) {
      throw new AppError(
        ErrorCodes.SRV_INTERNAL_ERROR,
        "Failed to create income",
        500
      );
    }

    // Log creation
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "INCOME_CREATED",
      affectedRecordIds: [id],
      metadata: { name: data.name, amount: data.amount, frequency: data.frequency },
    });

    // Trigger snowball recalculation (income changes affect disposable income)
    await snowballService.recalculateSnowballPositions(orgId, db);

    return created;
  }

  /**
   * Update an existing income record
   * 
   * Updates income with organization filtering to ensure users can only
   * update incomes belonging to their organization.
   * 
   * @param id - Income ID
   * @param orgId - Organization ID
   * @param userId - User ID making the update
   * @param data - Partial income data to update
   * @returns Updated income record
   * @throws {AppError} if income not found or doesn't belong to organization
   * 
   */
  async updateIncome(
    id: string,
    orgId: string,
    userId: string,
    data: UpdateIncomeInput
  ): Promise<typeof income.$inferSelect> {
    // Verify income exists and belongs to organization
    const existing = await db
      .select()
      .from(income)
      .where(and(eq(income.id, id), eq(income.organizationId, orgId)))
      .limit(1);

    if (existing.length === 0) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Income not found or access denied",
        404
      );
    }

    // Update income
    const [updated] = await db
      .update(income)
      .set(data)
      .where(and(eq(income.id, id), eq(income.organizationId, orgId)))
      .returning();

    if (!updated) {
      throw new AppError(
        ErrorCodes.SRV_INTERNAL_ERROR,
        "Failed to update income",
        500
      );
    }

    // Log update
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "INCOME_UPDATED",
      affectedRecordIds: [id],
      metadata: { changes: data },
    });

    // Trigger snowball recalculation (income changes affect disposable income)
    await snowballService.recalculateSnowballPositions(orgId, db);

    return updated;
  }

  /**
   * Delete an income record
   * 
   * Deletes income with organization filtering and triggers recalculation
   * of dependent financial projections.
   * 
   * @param id - Income ID
   * @param orgId - Organization ID
   * @param userId - User ID making the deletion
   * @throws {AppError} if income not found or doesn't belong to organization
   * 
   */
  async deleteIncome(
    id: string,
    orgId: string,
    userId: string
  ): Promise<void> {
    // Verify income exists and belongs to organization
    const existing = await db
      .select()
      .from(income)
      .where(and(eq(income.id, id), eq(income.organizationId, orgId)))
      .limit(1);

    if (existing.length === 0) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Income not found or access denied",
        404
      );
    }

    // Delete income
    await db
      .delete(income)
      .where(and(eq(income.id, id), eq(income.organizationId, orgId)));

    // Log deletion
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "INCOME_DELETED",
      affectedRecordIds: [id],
      metadata: { name: existing[0]?.name },
    });

    // Trigger snowball recalculation (income changes affect disposable income)
    await snowballService.recalculateSnowballPositions(orgId, db);
  }

  /**
   * List incomes for an organization
   * 
   * Returns incomes with organization filtering and pagination support.
   * 
   * @param orgId - Organization ID
   * @param options - Pagination and sorting options
   * @returns Array of income records
   * 
   */
  async listIncomes(
    orgId: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: "createdAt" | "name" | "amount";
      order?: "asc" | "desc";
    } = {}
  ): Promise<{
    incomes: Array<typeof income.$inferSelect>;
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  }> {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const sortBy = options.sortBy || "createdAt";
    const order = options.order || "desc";
    const offset = (page - 1) * limit;

    // Build order clause
    const orderColumn = income[sortBy];
    const orderFn = order === "asc" ? asc : desc;

    // Fetch incomes with pagination
    const incomes = await db
      .select()
      .from(income)
      .where(eq(income.organizationId, orgId))
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalResult = await db
      .select()
      .from(income)
      .where(eq(income.organizationId, orgId));
    
    const total = totalResult.length;

    return {
      incomes,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }

  /**
   * Get a single income by ID
   * 
   * @param id - Income ID
   * @param orgId - Organization ID
   * @returns Income record
   * @throws {AppError} if income not found or doesn't belong to organization
   */
  async getIncome(
    id: string,
    orgId: string
  ): Promise<typeof income.$inferSelect> {
    const [result] = await db
      .select()
      .from(income)
      .where(and(eq(income.id, id), eq(income.organizationId, orgId)))
      .limit(1);

    if (!result) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Income not found or access denied",
        404
      );
    }

    return result;
  }

  /**
   * Calculate total monthly income for an organization
   * 
   * Converts all income frequencies to monthly equivalents and sums them.
   * One-time incomes are excluded from the monthly total.
   * 
   * @param orgId - Organization ID
   * @returns Total monthly income as Decimal
   * 
   */
  async getMonthlyTotal(orgId: string): Promise<Decimal> {
    // Fetch all incomes for the organization
    const incomes = await db
      .select()
      .from(income)
      .where(eq(income.organizationId, orgId));

    // Convert each income to monthly equivalent and sum
    let total = new Decimal(0);

    for (const inc of incomes) {
      const amount = new Decimal(inc.amount);
      const frequency = inc.frequency as Frequency;
      const monthlyAmount = toMonthlyEquivalent(amount, frequency);
      total = total.plus(monthlyAmount);
    }

    return total;
  }

}

// Export singleton instance
export const incomeService = new IncomeService();
