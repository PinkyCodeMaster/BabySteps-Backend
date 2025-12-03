import { db } from "../db";
import { debt } from "../db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { auditService } from "./audit.service";
import { snowballService } from "./snowball.service";
import { AppError, ErrorCodes } from "../middleware/errorHandler.middleware";
import Decimal from "decimal.js";
import type { CreateDebtInput, UpdateDebtInput, RecordPaymentInput } from "../db/schema/debts";

/**
 * Debt Service
 * 
 * Provides business logic for debt management operations.
 * Handles CRUD operations with organization filtering, payment recording,
 * status transitions, and CCJ validation.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export class DebtService {
  /**
   * Create a new debt record
   * 
   * Creates a debt associated with the user's organization with active status default.
   * Validates CCJ debts require a deadline date.
   * All required fields are validated via Zod schema before reaching this service.
   * 
   * @param orgId - Organization ID
   * @param userId - User ID creating the debt
   * @param data - Debt data
   * @returns Created debt record
   * @throws {AppError} if CCJ debt is missing deadline
   * 
   * Requirements: 5.1, 5.2
   * Property 24: Debt creation with active status
   * Property 25: CCJ debts require deadline
   */
  async createDebt(
    orgId: string,
    userId: string,
    data: CreateDebtInput
  ): Promise<typeof debt.$inferSelect> {
    // Validate CCJ requirement
    if (data.isCcj && !data.ccjDeadline) {
      throw new AppError(
        ErrorCodes.DEBT_CCJ_REQUIRES_DEADLINE,
        "CCJ debts must have a deadline date",
        400
      );
    }

    // Generate ID
    const id = crypto.randomUUID();

    // Insert debt with active status default
    const [created] = await db
      .insert(debt)
      .values({
        id,
        organizationId: orgId,
        status: "active",
        ...data,
      })
      .returning();

    if (!created) {
      throw new AppError(
        ErrorCodes.SRV_INTERNAL_ERROR,
        "Failed to create debt",
        500
      );
    }

    // Log creation
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "DEBT_CREATED",
      affectedRecordIds: [id],
      metadata: { 
        name: data.name, 
        balance: data.balance,
        type: data.type,
        isCcj: data.isCcj,
        status: "active"
      },
    });

    // Trigger snowball recalculation
    await snowballService.recalculateSnowballPositions(orgId, db);

    return created;
  }

  /**
   * Update an existing debt record
   * 
   * Updates debt with organization filtering to ensure users can only
   * update debts belonging to their organization.
   * Validates CCJ requirement if isCcj is being set to true.
   * 
   * @param id - Debt ID
   * @param orgId - Organization ID
   * @param userId - User ID making the update
   * @param data - Partial debt data to update
   * @returns Updated debt record
   * @throws {AppError} if debt not found, doesn't belong to organization, or validation fails
   * 
   * Requirements: 5.1, 5.2
   * Property 25: CCJ debts require deadline
   */
  async updateDebt(
    id: string,
    orgId: string,
    userId: string,
    data: UpdateDebtInput
  ): Promise<typeof debt.$inferSelect> {
    // Verify debt exists and belongs to organization
    const existing = await db
      .select()
      .from(debt)
      .where(and(eq(debt.id, id), eq(debt.organizationId, orgId)))
      .limit(1);

    if (existing.length === 0) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Debt not found or access denied",
        404
      );
    }

    const existingDebt = existing[0]!;

    // Validate CCJ requirement
    if (data.isCcj === true && !data.ccjDeadline && !existingDebt.ccjDeadline) {
      throw new AppError(
        ErrorCodes.DEBT_CCJ_REQUIRES_DEADLINE,
        "CCJ debts must have a deadline date",
        400
      );
    }

    // Cannot modify paid debts
    if (existingDebt.status === "paid") {
      throw new AppError(
        ErrorCodes.DEBT_CANNOT_MODIFY_PAID,
        "Cannot modify a debt that has been paid off",
        400
      );
    }

    // Update debt
    const [updated] = await db
      .update(debt)
      .set(data)
      .where(and(eq(debt.id, id), eq(debt.organizationId, orgId)))
      .returning();

    if (!updated) {
      throw new AppError(
        ErrorCodes.SRV_INTERNAL_ERROR,
        "Failed to update debt",
        500
      );
    }

    // Log update
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "DEBT_UPDATED",
      affectedRecordIds: [id],
      metadata: { changes: data },
    });

    // Trigger snowball recalculation
    await snowballService.recalculateSnowballPositions(orgId, db);

    return updated;
  }

  /**
   * Record a payment on a debt
   * 
   * Records a payment:
   * - Updates balance
   * - Checks if balance reaches zero
   * - Transitions status to paid if balance is zero
   * - Creates audit log
   * 
   * Note: Transaction support will be added when using neon-serverless driver
   * 
   * @param id - Debt ID
   * @param orgId - Organization ID
   * @param userId - User ID making the payment
   * @param paymentData - Payment amount
   * @returns Updated debt record
   * @throws {AppError} if debt not found, payment exceeds balance, or debt is already paid
   * 
   * Requirements: 5.3, 5.4, 5.5
   * Property 26: Payment recording reduces balance
   * Property 27: Zero balance transitions to paid
   * Property 28: Status changes are validated and audited
   */
  async recordPayment(
    id: string,
    orgId: string,
    userId: string,
    paymentData: RecordPaymentInput
  ): Promise<typeof debt.$inferSelect> {
    // Fetch debt
    const [existingDebt] = await db
      .select()
      .from(debt)
      .where(and(eq(debt.id, id), eq(debt.organizationId, orgId)))
      .limit(1);

    if (!existingDebt) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Debt not found or access denied",
        404
      );
    }

    // Cannot record payment on paid debt
    if (existingDebt.status === "paid") {
      throw new AppError(
        ErrorCodes.DEBT_CANNOT_MODIFY_PAID,
        "Cannot record payment on a debt that is already paid off",
        400
      );
    }

    const currentBalance = new Decimal(existingDebt.balance);
    const paymentAmount = new Decimal(paymentData.amount);

    // Validate payment doesn't exceed balance
    if (paymentAmount.greaterThan(currentBalance)) {
      throw new AppError(
        ErrorCodes.DEBT_PAYMENT_EXCEEDS_BALANCE,
        "Payment amount cannot exceed current balance",
        400
      );
    }

    // Calculate new balance
    const newBalance = currentBalance.minus(paymentAmount);
    const isZeroBalance = newBalance.lessThanOrEqualTo(0);

    // Update debt
    const [updated] = await db
      .update(debt)
      .set({
        balance: isZeroBalance ? "0.00" : newBalance.toFixed(2),
        status: isZeroBalance ? "paid" : existingDebt.status,
      })
      .where(and(eq(debt.id, id), eq(debt.organizationId, orgId)))
      .returning();

    if (!updated) {
      throw new AppError(
        ErrorCodes.SRV_INTERNAL_ERROR,
        "Failed to record payment",
        500
      );
    }

    // Log payment
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "PAYMENT_RECORDED",
      affectedRecordIds: [id],
      metadata: {
        amount: paymentData.amount,
        previousBalance: existingDebt.balance,
        newBalance: updated.balance,
        statusChanged: isZeroBalance,
        newStatus: updated.status,
      },
    });

    // Log status change if debt was paid off
    if (isZeroBalance) {
      await auditService.log({
        userId,
        organizationId: orgId,
        action: "DEBT_STATUS_CHANGED",
        affectedRecordIds: [id],
        metadata: {
          previousStatus: existingDebt.status,
          newStatus: "paid",
          reason: "Balance reached zero",
        },
      });
    }

    // Trigger snowball recalculation
    await snowballService.recalculateSnowballPositions(orgId, db);

    return updated;
  }

  /**
   * Delete a debt record
   * 
   * Deletes debt with organization filtering.
   * 
   * @param id - Debt ID
   * @param orgId - Organization ID
   * @param userId - User ID making the deletion
   * @throws {AppError} if debt not found or doesn't belong to organization
   * 
   * Requirements: 5.1
   */
  async deleteDebt(
    id: string,
    orgId: string,
    userId: string
  ): Promise<void> {
    // Verify debt exists and belongs to organization
    const existing = await db
      .select()
      .from(debt)
      .where(and(eq(debt.id, id), eq(debt.organizationId, orgId)))
      .limit(1);

    if (existing.length === 0) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Debt not found or access denied",
        404
      );
    }

    // Delete debt
    await db
      .delete(debt)
      .where(and(eq(debt.id, id), eq(debt.organizationId, orgId)));

    // Log deletion
    await auditService.log({
      userId,
      organizationId: orgId,
      action: "DEBT_DELETED",
      affectedRecordIds: [id],
      metadata: { name: existing[0]?.name },
    });

    // Trigger snowball recalculation
    await snowballService.recalculateSnowballPositions(orgId, db);
  }

  /**
   * List debts for an organization
   * 
   * Returns debts with organization filtering, pagination support,
   * filtering by status and CCJ flag, and ordering by snowball position.
   * 
   * @param orgId - Organization ID
   * @param options - Pagination, sorting, and filtering options
   * @returns Array of debt records with pagination metadata
   * 
   * Requirements: 5.1, 5.6
   * Property 29: Debts ordered by snowball position
   */
  async listDebts(
    orgId: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: "createdAt" | "name" | "balance" | "snowballPosition";
      order?: "asc" | "desc";
      status?: "active" | "paid";
      isCcj?: boolean;
      type?: string;
    } = {}
  ): Promise<{
    debts: Array<typeof debt.$inferSelect>;
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  }> {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const sortBy = options.sortBy || "snowballPosition";
    const order = options.order || "asc";
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(debt.organizationId, orgId)];
    
    if (options.status) {
      conditions.push(eq(debt.status, options.status));
    }
    
    if (options.isCcj !== undefined) {
      conditions.push(eq(debt.isCcj, options.isCcj));
    }
    
    if (options.type) {
      conditions.push(eq(debt.type, options.type as any));
    }

    // Build order clause
    const orderColumn = debt[sortBy];
    const orderFn = order === "asc" ? asc : desc;

    // Fetch debts with pagination and filtering
    const debts = await db
      .select()
      .from(debt)
      .where(and(...conditions))
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset(offset);

    // Get total count with same filters
    const totalResult = await db
      .select()
      .from(debt)
      .where(and(...conditions));
    
    const total = totalResult.length;

    return {
      debts,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }

  /**
   * Get a single debt by ID
   * 
   * @param id - Debt ID
   * @param orgId - Organization ID
   * @returns Debt record
   * @throws {AppError} if debt not found or doesn't belong to organization
   * 
   * Requirements: 5.1
   */
  async getDebt(
    id: string,
    orgId: string
  ): Promise<typeof debt.$inferSelect> {
    const [result] = await db
      .select()
      .from(debt)
      .where(and(eq(debt.id, id), eq(debt.organizationId, orgId)))
      .limit(1);

    if (!result) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "Debt not found or access denied",
        404
      );
    }

    return result;
  }

  /**
   * Get active debts for an organization
   * 
   * Returns only debts with status = active, ordered by snowball position.
   * 
   * @param orgId - Organization ID
   * @returns Array of active debt records
   * 
   * Requirements: 5.6
   */
  async getActiveDebts(orgId: string): Promise<Array<typeof debt.$inferSelect>> {
    const debts = await db
      .select()
      .from(debt)
      .where(and(eq(debt.organizationId, orgId), eq(debt.status, "active")))
      .orderBy(asc(debt.snowballPosition));

    return debts;
  }
}

// Export singleton instance
export const debtService = new DebtService();
