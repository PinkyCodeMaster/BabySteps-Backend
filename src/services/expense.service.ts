import { db } from "../db";
import { expense } from "../db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { auditService } from "./audit.service";
import { snowballService } from "./snowball.service";
import { getCacheService } from "./cache.service";
import { AppError, ErrorCodes } from "../middleware/errorHandler.middleware";
import { toMonthlyEquivalent, type Frequency } from "../utils/frequency";
import Decimal from "decimal.js";
import type { CreateExpenseInput, UpdateExpenseInput } from "../db/schema/expenses";

/**
 * Expense Service
 * 
 * Provides business logic for expense management operations.
 * Handles CRUD operations with organization filtering, frequency conversion,
 * UC-paid expense exclusion, and recalculation triggers.
 * 
 * Requirements: 4.1, 4.4, 4.5
 */
export class ExpenseService {
  /**
   * Create a new expense record
   * 
   * Creates an expense associated with the user's organization.
   * All required fields are validated via Zod schema before reaching this service.
   * 
   * @param orgId - Organization ID
   * @param userId - User ID creating the expense
   * @param data - Expense data
   * @returns Created expense record
   * 
   * Requirements: 4.1
   * Property 18: Expense creation with organization association
   */
  async createExpense(
    orgId: string,
    userId: string,
    data: CreateExpenseInput
  ): Promise<typeof expense.$inferSelect> {
    // Generate ID
    const id = crypto.randomUUID();

    // Insert expense
    const [created] = await db
      .insert(expense)
      .values({
        id,
        organizationId: orgId,
        ...data,
      })
      .returning();

    if (!created) {
      throw new AppError(
        ErrorCodes.SRV_INTERNAL_ERROR,
        "Failed to create expense",
        500
      );
    }

    // Log creation
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "EXPENSE_CREATED",
      affectedRecordIds: [id],
      metadata: { 
        name: data.name, 
        amount: data.amount, 
        category: data.category,
        priority: data.priority,
        frequency: data.frequency 
      },
    });

    // Trigger snowball recalculation (expense changes affect disposable income)
    await snowballService.recalculateSnowballPositions(orgId, db);

    // Invalidate calculation caches
    const cacheService = getCacheService();
    await cacheService.invalidateOrgCalculations(orgId);

    return created;
  }

  /**
   * Update an existing expense record
   * 
   * Updates expense with organization filtering to ensure users can only
   * update expenses belonging to their organization.
   * 
   * @param id - Expense ID
   * @param orgId - Organization ID
   * @param userId - User ID making the update
   * @param data - Partial expense data to update
   * @returns Updated expense record
   * @throws {AppError} if expense not found or doesn't belong to organization
   * 
   * Requirements: 4.1
   * Property 18: Expense creation with organization association
   */
  async updateExpense(
    id: string,
    orgId: string,
    userId: string,
    data: UpdateExpenseInput
  ): Promise<typeof expense.$inferSelect> {
    // Verify expense exists and belongs to organization
    const existing = await db
      .select()
      .from(expense)
      .where(and(eq(expense.id, id), eq(expense.organizationId, orgId)))
      .limit(1);

    if (existing.length === 0) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Expense not found or access denied",
        404
      );
    }

    // Update expense
    const [updated] = await db
      .update(expense)
      .set(data)
      .where(and(eq(expense.id, id), eq(expense.organizationId, orgId)))
      .returning();

    if (!updated) {
      throw new AppError(
        ErrorCodes.SRV_INTERNAL_ERROR,
        "Failed to update expense",
        500
      );
    }

    // Log update
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "EXPENSE_UPDATED",
      affectedRecordIds: [id],
      metadata: { changes: data },
    });

    // Trigger snowball recalculation (expense changes affect disposable income)
    await snowballService.recalculateSnowballPositions(orgId, db);

    // Invalidate calculation caches
    const cacheService = getCacheService();
    await cacheService.invalidateOrgCalculations(orgId);

    return updated;
  }

  /**
   * Delete an expense record
   * 
   * Deletes expense with organization filtering and triggers recalculation
   * of dependent financial projections.
   * 
   * @param id - Expense ID
   * @param orgId - Organization ID
   * @param userId - User ID making the deletion
   * @throws {AppError} if expense not found or doesn't belong to organization
   * 
   * Requirements: 4.5
   */
  async deleteExpense(
    id: string,
    orgId: string,
    userId: string
  ): Promise<void> {
    // Verify expense exists and belongs to organization
    const existing = await db
      .select()
      .from(expense)
      .where(and(eq(expense.id, id), eq(expense.organizationId, orgId)))
      .limit(1);

    if (existing.length === 0) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Expense not found or access denied",
        404
      );
    }

    // Delete expense
    await db
      .delete(expense)
      .where(and(eq(expense.id, id), eq(expense.organizationId, orgId)));

    // Log deletion
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "EXPENSE_DELETED",
      affectedRecordIds: [id],
      metadata: { name: existing[0]?.name },
    });

    // Trigger snowball recalculation (expense changes affect disposable income)
    await snowballService.recalculateSnowballPositions(orgId, db);

    // Invalidate calculation caches
    const cacheService = getCacheService();
    await cacheService.invalidateOrgCalculations(orgId);
  }

  /**
   * List expenses for an organization
   * 
   * Returns expenses with organization filtering, pagination support,
   * and filtering by category and priority.
   * 
   * @param orgId - Organization ID
   * @param options - Pagination, sorting, and filtering options
   * @returns Array of expense records with pagination metadata
   * 
   * Requirements: 4.1, 4.5
   */
  async listExpenses(
    orgId: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: "createdAt" | "name" | "amount";
      order?: "asc" | "desc";
      category?: string;
      priority?: string;
      isUcPaid?: boolean;
    } = {}
  ): Promise<{
    expenses: Array<typeof expense.$inferSelect>;
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

    // Build where conditions
    const conditions = [eq(expense.organizationId, orgId)];
    
    if (options.category) {
      conditions.push(eq(expense.category, options.category as any));
    }
    
    if (options.priority) {
      conditions.push(eq(expense.priority, options.priority as any));
    }
    
    if (options.isUcPaid !== undefined) {
      conditions.push(eq(expense.isUcPaid, options.isUcPaid));
    }

    // Build order clause
    const orderColumn = expense[sortBy];
    const orderFn = order === "asc" ? asc : desc;

    // Fetch expenses with pagination and filtering
    const expenses = await db
      .select()
      .from(expense)
      .where(and(...conditions))
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset(offset);

    // Get total count with same filters
    const totalResult = await db
      .select()
      .from(expense)
      .where(and(...conditions));
    
    const total = totalResult.length;

    return {
      expenses,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }

  /**
   * Get a single expense by ID
   * 
   * @param id - Expense ID
   * @param orgId - Organization ID
   * @returns Expense record
   * @throws {AppError} if expense not found or doesn't belong to organization
   * 
   * Requirements: 4.1
   */
  async getExpense(
    id: string,
    orgId: string
  ): Promise<typeof expense.$inferSelect> {
    const [result] = await db
      .select()
      .from(expense)
      .where(and(eq(expense.id, id), eq(expense.organizationId, orgId)))
      .limit(1);

    if (!result) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Expense not found or access denied",
        404
      );
    }

    return result;
  }

  /**
   * Calculate total monthly expenses for an organization
   * 
   * Converts all expense frequencies to monthly equivalents and sums them.
   * One-time expenses are excluded from the monthly total.
   * Optionally excludes UC-paid expenses from the calculation.
   * 
   * @param orgId - Organization ID
   * @param excludeUcPaid - Whether to exclude UC-paid expenses (default: false)
   * @returns Total monthly expenses as Decimal
   * 
   * Requirements: 4.4, 4.5
   * Property 22: UC-paid expenses excluded from calculations
   */
  async getMonthlyTotal(
    orgId: string,
    excludeUcPaid: boolean = false
  ): Promise<Decimal> {
    // Build where conditions
    const conditions = [eq(expense.organizationId, orgId)];
    
    if (excludeUcPaid) {
      conditions.push(eq(expense.isUcPaid, false));
    }

    // Fetch all expenses for the organization
    const expenses = await db
      .select()
      .from(expense)
      .where(and(...conditions));

    // Convert each expense to monthly equivalent and sum
    let total = new Decimal(0);

    for (const exp of expenses) {
      const amount = new Decimal(exp.amount);
      const frequency = exp.frequency as Frequency;
      const monthlyAmount = toMonthlyEquivalent(amount, frequency);
      total = total.plus(monthlyAmount);
    }

    return total;
  }
}

// Export singleton instance
export const expenseService = new ExpenseService();
