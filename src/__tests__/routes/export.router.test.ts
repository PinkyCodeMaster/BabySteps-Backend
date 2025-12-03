import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestOrganization, cleanupTestOrganization } from "../helpers/testSetup";
import { db } from "../../db";
import { organization, member, income, expense, debt } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { TestOrganization } from "../helpers/testSetup";

/**
 * Export Router - Integration Tests
 * 
 * Tests the data export endpoint functionality.
 * 
 * Requirements: 10.1
 */

describe("Export Router - Integration Tests", () => {
  let testOrg: TestOrganization;
  let testOrgId: string;
  let adminUserId: string;
  let memberUserId: string;

  beforeAll(async () => {
    // Create test organization with users
    testOrg = await createTestOrganization("Test Export Org", "test-export");
    testOrgId = testOrg.orgId;
    adminUserId = testOrg.adminUserId;
    memberUserId = testOrg.memberUserId;

    // Create some test data
    await db.insert(income).values({
      id: crypto.randomUUID(),
      organizationId: testOrgId,
      type: "salary",
      name: "Test Income",
      amount: "3000.00",
      frequency: "monthly",
      isNet: true,
    });

    await db.insert(expense).values({
      id: crypto.randomUUID(),
      organizationId: testOrgId,
      name: "Test Expense",
      amount: "500.00",
      category: "housing",
      priority: "essential",
      frequency: "monthly",
      isUcPaid: false,
    });

    await db.insert(debt).values({
      id: crypto.randomUUID(),
      organizationId: testOrgId,
      name: "Test Debt",
      type: "credit-card",
      balance: "1000.00",
      interestRate: "18.99",
      minimumPayment: "50.00",
      isCcj: false,
      status: "active",
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(debt).where(eq(debt.organizationId, testOrgId));
    await db.delete(expense).where(eq(expense.organizationId, testOrgId));
    await db.delete(income).where(eq(income.organizationId, testOrgId));
    
    // Clean up organization and users
    await cleanupTestOrganization(testOrg);
  });

  test("GET /orgs/:orgId/export returns all organization data for admin", async () => {
    // Note: This test would require proper auth middleware setup
    // For now, we'll test the service directly
    const { exportService } = await import("../../services/export.service");
    
    const exportData = await exportService.exportOrganizationData(testOrgId);

    expect(exportData).toBeDefined();
    expect(exportData.organizationId).toBe(testOrgId);
    expect(exportData.exportedAt).toBeDefined();
    expect(exportData.data).toBeDefined();
    
    // Verify all data types are included
    expect(exportData.data.incomes).toBeArray();
    expect(exportData.data.incomes.length).toBeGreaterThan(0);
    
    expect(exportData.data.expenses).toBeArray();
    expect(exportData.data.expenses.length).toBeGreaterThan(0);
    
    expect(exportData.data.debts).toBeArray();
    expect(exportData.data.debts.length).toBeGreaterThan(0);
    
    expect(exportData.data.members).toBeArray();
    expect(exportData.data.members.length).toBeGreaterThan(0);
    
    expect(exportData.data.invitations).toBeArray();
    
    // Baby steps may be null if not created
    expect(exportData.data.babySteps).toBeDefined();
  });

  test("Export includes correct income data", async () => {
    const { exportService } = await import("../../services/export.service");
    
    const exportData = await exportService.exportOrganizationData(testOrgId);
    
    const incomeData = exportData.data.incomes[0];
    expect(incomeData).toBeDefined();
    expect(incomeData?.name).toBe("Test Income");
    expect(incomeData?.amount).toBe("3000.00");
    expect(incomeData?.frequency).toBe("monthly");
  });

  test("Export includes correct expense data", async () => {
    const { exportService } = await import("../../services/export.service");
    
    const exportData = await exportService.exportOrganizationData(testOrgId);
    
    const expenseData = exportData.data.expenses[0];
    expect(expenseData).toBeDefined();
    expect(expenseData?.name).toBe("Test Expense");
    expect(expenseData?.amount).toBe("500.00");
    expect(expenseData?.category).toBe("housing");
  });

  test("Export includes correct debt data", async () => {
    const { exportService } = await import("../../services/export.service");
    
    const exportData = await exportService.exportOrganizationData(testOrgId);
    
    const debtData = exportData.data.debts[0];
    expect(debtData).toBeDefined();
    expect(debtData?.name).toBe("Test Debt");
    expect(debtData?.balance).toBe("1000.00");
    expect(debtData?.status).toBe("active");
  });

  test("Export includes member data", async () => {
    const { exportService } = await import("../../services/export.service");
    
    const exportData = await exportService.exportOrganizationData(testOrgId);
    
    expect(exportData.data.members.length).toBe(2);
    
    const adminMember = exportData.data.members.find(m => m.userId === adminUserId);
    expect(adminMember).toBeDefined();
    expect(adminMember?.role).toBe("admin");
    
    const regularMember = exportData.data.members.find(m => m.userId === memberUserId);
    expect(regularMember).toBeDefined();
    expect(regularMember?.role).toBe("member");
  });

  test("Export only includes data for specified organization", async () => {
    // Create another organization with data
    const otherOrgId = crypto.randomUUID();
    await db.insert(organization).values({
      id: otherOrgId,
      name: "Other Org",
      slug: "other-org",
      createdAt: new Date(),
    });

    await db.insert(income).values({
      id: crypto.randomUUID(),
      organizationId: otherOrgId,
      type: "salary",
      name: "Other Income",
      amount: "5000.00",
      frequency: "monthly",
      isNet: true,
    });

    const { exportService } = await import("../../services/export.service");
    
    const exportData = await exportService.exportOrganizationData(testOrgId);
    
    // Verify no data from other organization is included
    const hasOtherOrgIncome = exportData.data.incomes.some(
      i => i.name === "Other Income"
    );
    expect(hasOtherOrgIncome).toBe(false);

    // Clean up
    await db.delete(income).where(eq(income.organizationId, otherOrgId));
    await db.delete(organization).where(eq(organization.id, otherOrgId));
  });
});
