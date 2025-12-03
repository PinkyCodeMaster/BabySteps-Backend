import { db } from "../db";
import { income } from "../db/schema/incomes";
import { expense } from "../db/schema/expenses";
import { debt } from "../db/schema/debts";
import { babyStep } from "../db/schema/babySteps";
import { member, invitation } from "../db/schema/users";
import { eq } from "drizzle-orm";

/**
 * Export Service
 * 
 * Provides functionality to export all organization data in JSON format.
 * Used for data portability and GDPR compliance (right to access).
 * 
 * Requirements: 10.1
 */

/**
 * Organization export data structure
 */
export interface OrganizationExport {
  organizationId: string;
  exportedAt: string;
  data: {
    incomes: Array<typeof income.$inferSelect>;
    expenses: Array<typeof expense.$inferSelect>;
    debts: Array<typeof debt.$inferSelect>;
    babySteps: typeof babyStep.$inferSelect | null;
    members: Array<typeof member.$inferSelect>;
    invitations: Array<typeof invitation.$inferSelect>;
  };
}

export class ExportService {
  /**
   * Export all organization data
   * 
   * Gathers all financial and membership data for an organization
   * and formats it as JSON for export.
   * 
   * @param orgId - Organization ID
   * @returns Complete organization data export
   * 
   * Requirements: 10.1
   */
  async exportOrganizationData(orgId: string): Promise<OrganizationExport> {
    // Fetch all incomes
    const incomes = await db
      .select()
      .from(income)
      .where(eq(income.organizationId, orgId));

    // Fetch all expenses
    const expenses = await db
      .select()
      .from(expense)
      .where(eq(expense.organizationId, orgId));

    // Fetch all debts
    const debts = await db
      .select()
      .from(debt)
      .where(eq(debt.organizationId, orgId));

    // Fetch Baby Steps status
    const [babySteps] = await db
      .select()
      .from(babyStep)
      .where(eq(babyStep.organizationId, orgId))
      .limit(1);

    // Fetch all members
    const members = await db
      .select()
      .from(member)
      .where(eq(member.organizationId, orgId));

    // Fetch all invitations
    const invitations = await db
      .select()
      .from(invitation)
      .where(eq(invitation.organizationId, orgId));

    // Construct export object
    return {
      organizationId: orgId,
      exportedAt: new Date().toISOString(),
      data: {
        incomes,
        expenses,
        debts,
        babySteps: babySteps || null,
        members,
        invitations,
      },
    };
  }
}

// Export singleton instance
export const exportService = new ExportService();
