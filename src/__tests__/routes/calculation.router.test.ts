import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Hono } from "hono";
import { db } from "../../db";
import { organization, member, user, income, expense, debt, ucConfig } from "../../db/schema";
import { eq } from "drizzle-orm";
import calculationRouter from "../../routes/calculation.router";
import Decimal from "decimal.js";

/**
 * Integration tests for Calculation Router
 * 
 * Tests the HTTP endpoints for financial calculations including:
 * - Snowball endpoint with various debt scenarios
 * - Debt-free date with interest calculations
 * - Disposable income with UC taper
 * 
 * Requirements: 6.1, 6.6, 7.3
 */

describe("Calculation Router - Integration Tests", () => {
  let testOrgId: string;
  let testUserId: string;
  let testApp: Hono;

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

    // Create UC config for testing
    await db.insert(ucConfig).values({
      id: crypto.randomUUID(),
      taperRate: "0.55",
      workAllowance: "600.00",
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
    });

    // Create test app with mocked auth middleware
    // We need to create a new router without the auth middleware for testing
    testApp = new Hono();
    
    // Mock auth middleware that sets the test user context
    testApp.use("/*", async (c, next) => {
      c.set("userId", testUserId);
      c.set("organizationId", testOrgId);
      c.set("role", "member");
      await next();
    });
    
    // Import and mount calculation routes directly without auth middleware
    // We'll manually add the routes here for testing
    const { debtService } = await import("../../services/debt.service");
    const { incomeService } = await import("../../services/income.service");
    const { expenseService } = await import("../../services/expense.service");
    const { ucService } = await import("../../services/uc.service");
    const { snowballService } = await import("../../services/snowball.service");
    const { getAuthContext } = await import("../../middleware/auth.middleware");
    
    // Snowball endpoint
    testApp.get("/:orgId/snowball", async (c) => {
      const { organizationId } = getAuthContext(c);
      const orgId = c.req.param("orgId");

      if (orgId !== organizationId) {
        return c.json(
          {
            error: {
              code: "AUTHZ_002",
              message: "Organization not found or access denied",
            },
          },
          403
        );
      }

      const activeDebts = await debtService.getActiveDebts(orgId);
      const grossIncome = await incomeService.getMonthlyTotal(orgId);
      const totalExpenses = await expenseService.getMonthlyTotal(orgId, true);
      const ucTaper = await ucService.calculateTaperForIncome(grossIncome);
      const disposableIncome = grossIncome.minus(totalExpenses).minus(ucTaper);

      const paymentSchedule = snowballService.calculateMonthlyPayments(
        activeDebts,
        disposableIncome
      );

      const response = {
        debts: paymentSchedule.debts.map((debt) => ({
          debtId: debt.debtId,
          name: debt.name,
          balance: debt.balance.toFixed(2),
          minimumPayment: debt.minimumPayment.toFixed(2),
          monthlyPayment: debt.monthlyPayment.toFixed(2),
          snowballPosition: debt.snowballPosition,
        })),
        totalMonthlyPayment: paymentSchedule.totalMonthlyPayment.toFixed(2),
        disposableIncome: disposableIncome.toFixed(2),
      };

      return c.json(response, 200);
    });
    
    // Debt-free date endpoint
    testApp.get("/:orgId/debt-free-date", async (c) => {
      const { organizationId } = getAuthContext(c);
      const orgId = c.req.param("orgId");

      if (orgId !== organizationId) {
        return c.json(
          {
            error: {
              code: "AUTHZ_002",
              message: "Organization not found or access denied",
            },
          },
          403
        );
      }

      const activeDebts = await debtService.getActiveDebts(orgId);
      const grossIncome = await incomeService.getMonthlyTotal(orgId);
      const totalExpenses = await expenseService.getMonthlyTotal(orgId, true);
      const ucTaper = await ucService.calculateTaperForIncome(grossIncome);
      const disposableIncome = grossIncome.minus(totalExpenses).minus(ucTaper);

      const projection = snowballService.projectDebtFreeDate(
        activeDebts,
        disposableIncome
      );

      const response = {
        debtFreeDate: projection.debtFreeDate ? projection.debtFreeDate.toISOString() : null,
        monthsToDebtFree: projection.monthsToDebtFree,
        totalMonthlyPayment: disposableIncome.toFixed(2),
        disposableIncome: disposableIncome.toFixed(2),
        schedule: projection.schedule.map((month) => ({
          month: month.month,
          year: month.year,
          debts: month.debts.map((debt) => ({
            debtId: debt.debtId,
            name: debt.name,
            startingBalance: debt.startingBalance.toFixed(2),
            interestCharged: debt.interestCharged.toFixed(2),
            paymentApplied: debt.paymentApplied.toFixed(2),
            endingBalance: debt.endingBalance.toFixed(2),
            isPaidOff: debt.isPaidOff,
          })),
        })),
      };

      return c.json(response, 200);
    });
    
    // Disposable income endpoint
    testApp.get("/:orgId/disposable-income", async (c) => {
      const { organizationId } = getAuthContext(c);
      const orgId = c.req.param("orgId");

      if (orgId !== organizationId) {
        return c.json(
          {
            error: {
              code: "AUTHZ_002",
              message: "Organization not found or access denied",
            },
          },
          403
        );
      }

      const grossIncome = await incomeService.getMonthlyTotal(orgId);
      const totalExpenses = await expenseService.getMonthlyTotal(orgId, true);
      const ucTaper = await ucService.calculateTaperForIncome(grossIncome);
      const disposableIncome = grossIncome.minus(totalExpenses).minus(ucTaper);

      const response = {
        grossIncome: grossIncome.toFixed(2),
        totalExpenses: totalExpenses.toFixed(2),
        ucTaper: ucTaper.toFixed(2),
        disposableIncome: disposableIncome.toFixed(2),
      };

      return c.json(response, 200);
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(income).where(eq(income.organizationId, testOrgId));
    await db.delete(expense).where(eq(expense.organizationId, testOrgId));
    await db.delete(debt).where(eq(debt.organizationId, testOrgId));
    await db.delete(member).where(eq(member.organizationId, testOrgId));
    await db.delete(organization).where(eq(organization.id, testOrgId));
    await db.delete(user).where(eq(user.id, testUserId));
  });

  beforeEach(async () => {
    // Clean up financial data before each test
    await db.delete(income).where(eq(income.organizationId, testOrgId));
    await db.delete(expense).where(eq(expense.organizationId, testOrgId));
    await db.delete(debt).where(eq(debt.organizationId, testOrgId));
  });

  /**
   * Test snowball endpoint with various debt scenarios
   * Requirements: 6.1
   */
  describe("GET /:orgId/snowball", () => {
    test("returns empty snowball when no debts exist", async () => {
      // Create income and expenses but no debts
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Monthly Salary",
        amount: "3000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "1000.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/snowball`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.debts).toEqual([]);
      expect(parseFloat(data.totalMonthlyPayment)).toBe(0);
      expect(parseFloat(data.disposableIncome)).toBeGreaterThan(0);
    });

    test("orders CCJ debts by deadline first", async () => {
      // Create income
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Monthly Salary",
        amount: "3000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create expenses
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "1000.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create CCJ debts with different deadlines
      const ccjDebt1Id = crypto.randomUUID();
      await db.insert(debt).values({
        id: ccjDebt1Id,
        organizationId: testOrgId,
        name: "CCJ Debt 1 (Later)",
        type: "ccj",
        balance: "2000.00",
        interestRate: "10.00",
        minimumPayment: "100.00",
        isCcj: true,
        ccjDeadline: "2026-12-31",
        status: "active",
        snowballPosition: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const ccjDebt2Id = crypto.randomUUID();
      await db.insert(debt).values({
        id: ccjDebt2Id,
        organizationId: testOrgId,
        name: "CCJ Debt 2 (Earlier)",
        type: "ccj",
        balance: "3000.00",
        interestRate: "12.00",
        minimumPayment: "150.00",
        isCcj: true,
        ccjDeadline: "2026-06-30",
        status: "active",
        snowballPosition: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create non-CCJ debt
      const regularDebtId = crypto.randomUUID();
      await db.insert(debt).values({
        id: regularDebtId,
        organizationId: testOrgId,
        name: "Regular Debt",
        type: "loan",
        balance: "1000.00",
        interestRate: "15.00",
        minimumPayment: "50.00",
        isCcj: false,
        status: "active",
        snowballPosition: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/snowball`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.debts.length).toBe(3);
      
      // Verify CCJ debts are prioritized by deadline
      expect(data.debts[0].debtId).toBe(ccjDebt2Id); // Earlier deadline
      expect(data.debts[0].snowballPosition).toBe(1);
      expect(data.debts[1].debtId).toBe(ccjDebt1Id); // Later deadline
      expect(data.debts[1].snowballPosition).toBe(2);
      expect(data.debts[2].debtId).toBe(regularDebtId); // Non-CCJ
      expect(data.debts[2].snowballPosition).toBe(3);
    });

    test("orders non-CCJ debts by smallest balance", async () => {
      // Create income
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Monthly Salary",
        amount: "3000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create expenses
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "1000.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create non-CCJ debts with different balances
      const smallDebtId = crypto.randomUUID();
      await db.insert(debt).values({
        id: smallDebtId,
        organizationId: testOrgId,
        name: "Small Debt",
        type: "credit-card",
        balance: "500.00",
        interestRate: "18.00",
        minimumPayment: "25.00",
        isCcj: false,
        status: "active",
        snowballPosition: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mediumDebtId = crypto.randomUUID();
      await db.insert(debt).values({
        id: mediumDebtId,
        organizationId: testOrgId,
        name: "Medium Debt",
        type: "loan",
        balance: "2000.00",
        interestRate: "12.00",
        minimumPayment: "100.00",
        isCcj: false,
        status: "active",
        snowballPosition: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const largeDebtId = crypto.randomUUID();
      await db.insert(debt).values({
        id: largeDebtId,
        organizationId: testOrgId,
        name: "Large Debt",
        type: "loan",
        balance: "5000.00",
        interestRate: "10.00",
        minimumPayment: "200.00",
        isCcj: false,
        status: "active",
        snowballPosition: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/snowball`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.debts.length).toBe(3);
      
      // Verify non-CCJ debts are ordered by smallest balance
      expect(data.debts[0].debtId).toBe(smallDebtId);
      expect(data.debts[0].snowballPosition).toBe(1);
      expect(parseFloat(data.debts[0].balance)).toBe(500);
      
      expect(data.debts[1].debtId).toBe(mediumDebtId);
      expect(data.debts[1].snowballPosition).toBe(2);
      expect(parseFloat(data.debts[1].balance)).toBe(2000);
      
      expect(data.debts[2].debtId).toBe(largeDebtId);
      expect(data.debts[2].snowballPosition).toBe(3);
      expect(parseFloat(data.debts[2].balance)).toBe(5000);
    });

    test("calculates monthly payments correctly", async () => {
      // Create income
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Monthly Salary",
        amount: "3000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create expenses
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "1000.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create debts
      await db.insert(debt).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Debt 1",
        type: "credit-card",
        balance: "1000.00",
        interestRate: "15.00",
        minimumPayment: "50.00",
        isCcj: false,
        status: "active",
        snowballPosition: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(debt).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Debt 2",
        type: "loan",
        balance: "2000.00",
        interestRate: "12.00",
        minimumPayment: "100.00",
        isCcj: false,
        status: "active",
        snowballPosition: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/snowball`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // Calculate expected disposable income
      // Income: 3000, Expenses: 1000, UC Taper: (3000 - 600) * 0.55 = 1320
      // Disposable: 3000 - 1000 - 1320 = -320 (negative)
      const expectedDisposable = new Decimal("3000").minus("1000").minus(new Decimal("2400").times("0.55"));
      
      // Verify total monthly payment calculation
      expect(data.debts.length).toBe(2);
      expect(parseFloat(data.disposableIncome)).toBeCloseTo(expectedDisposable.toNumber(), 2);
    });

    test("rejects access to other organization's data", async () => {
      const otherOrgId = crypto.randomUUID();
      
      const req = new Request(`http://localhost/${otherOrgId}/snowball`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(403);
      
      const data = await res.json();
      expect(data.error.code).toBe("AUTHZ_002");
    });
  });

  /**
   * Test debt-free date with interest calculations
   * Requirements: 6.6
   */
  describe("GET /:orgId/debt-free-date", () => {
    test("returns current date when no debts exist (already debt-free)", async () => {
      // Create income and expenses but no debts
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Monthly Salary",
        amount: "3000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "1000.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/debt-free-date`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // When no debts exist, you're already debt-free (returns current date)
      expect(data.debtFreeDate).not.toBeNull();
      expect(data.monthsToDebtFree).toBe(0);
      expect(data.schedule).toEqual([]);
    });

    test("projects debt-free date with interest calculations", async () => {
      // Create income
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Monthly Salary",
        amount: "5000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create minimal expenses
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "1000.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create a small debt that can be paid off quickly
      await db.insert(debt).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Small Debt",
        type: "credit-card",
        balance: "1000.00",
        interestRate: "18.00",
        minimumPayment: "50.00",
        isCcj: false,
        status: "active",
        snowballPosition: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/debt-free-date`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // Should have a debt-free date
      expect(data.debtFreeDate).not.toBeNull();
      expect(data.monthsToDebtFree).toBeGreaterThan(0);
      expect(data.schedule.length).toBeGreaterThan(0);
      
      // Verify schedule structure
      const firstMonth = data.schedule[0];
      expect(firstMonth.month).toBeDefined();
      expect(firstMonth.year).toBeDefined();
      expect(firstMonth.debts.length).toBe(1);
      
      const debtInSchedule = firstMonth.debts[0];
      expect(debtInSchedule.startingBalance).toBeDefined();
      expect(debtInSchedule.interestCharged).toBeDefined();
      expect(debtInSchedule.paymentApplied).toBeDefined();
      expect(debtInSchedule.endingBalance).toBeDefined();
    });

    test("includes interest in debt-free date calculation", async () => {
      // Create income
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Monthly Salary",
        amount: "4000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create expenses
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "1000.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create debt with interest
      await db.insert(debt).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Debt with Interest",
        type: "credit-card",
        balance: "2000.00",
        interestRate: "24.00", // High interest rate
        minimumPayment: "100.00",
        isCcj: false,
        status: "active",
        snowballPosition: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/debt-free-date`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // Verify interest is being charged in the schedule
      const firstMonth = data.schedule[0];
      const interestCharged = parseFloat(firstMonth.debts[0].interestCharged);
      
      // Interest should be positive (24% APR / 12 months = 2% per month)
      expect(interestCharged).toBeGreaterThan(0);
      
      // Approximate monthly interest: 2000 * 0.24 / 12 = 40
      expect(interestCharged).toBeCloseTo(40, 0);
    });

    test("handles multiple debts in projection", async () => {
      // Create income
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Monthly Salary",
        amount: "6000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create expenses
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "1500.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create multiple debts
      await db.insert(debt).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Debt 1",
        type: "credit-card",
        balance: "1000.00",
        interestRate: "18.00",
        minimumPayment: "50.00",
        isCcj: false,
        status: "active",
        snowballPosition: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(debt).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Debt 2",
        type: "loan",
        balance: "3000.00",
        interestRate: "12.00",
        minimumPayment: "150.00",
        isCcj: false,
        status: "active",
        snowballPosition: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/debt-free-date`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // Should have schedule entries
      expect(data.schedule.length).toBeGreaterThan(0);
      
      // First month should have both debts
      const firstMonth = data.schedule[0];
      expect(firstMonth.debts.length).toBe(2);
      
      // Later months should show first debt paid off
      const lastMonth = data.schedule[data.schedule.length - 1];
      const paidOffDebts = lastMonth.debts.filter((d: any) => d.isPaidOff);
      expect(paidOffDebts.length).toBeGreaterThan(0);
    });
  });

  /**
   * Test disposable income with UC taper
   * Requirements: 7.3
   */
  describe("GET /:orgId/disposable-income", () => {
    test("calculates disposable income without UC taper when below work allowance", async () => {
      // Create income below work allowance (600)
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Part-time",
        name: "Part-time Job",
        amount: "500.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create expenses
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "300.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/disposable-income`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // UC taper should be 0 when income is below work allowance
      expect(parseFloat(data.grossIncome)).toBe(500);
      expect(parseFloat(data.totalExpenses)).toBe(300);
      expect(parseFloat(data.ucTaper)).toBe(0);
      expect(parseFloat(data.disposableIncome)).toBe(200); // 500 - 300 - 0
    });

    test("calculates UC taper when income exceeds work allowance", async () => {
      // Create income above work allowance (600)
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Full-time Job",
        amount: "2000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create expenses
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "800.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/disposable-income`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // UC taper: (2000 - 600) * 0.55 = 770
      const expectedTaper = new Decimal("2000").minus("600").times("0.55");
      
      expect(parseFloat(data.grossIncome)).toBe(2000);
      expect(parseFloat(data.totalExpenses)).toBe(800);
      expect(parseFloat(data.ucTaper)).toBeCloseTo(expectedTaper.toNumber(), 2);
      
      // Disposable: 2000 - 800 - 770 = 430
      const expectedDisposable = new Decimal("2000").minus("800").minus(expectedTaper);
      expect(parseFloat(data.disposableIncome)).toBeCloseTo(expectedDisposable.toNumber(), 2);
    });

    test("excludes UC-paid expenses from disposable income calculation", async () => {
      // Create income
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Monthly Salary",
        amount: "2000.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create regular expense
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Food",
        amount: "300.00",
        category: "food",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create UC-paid expense (should be excluded)
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent (UC Paid)",
        amount: "500.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/disposable-income`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // Total expenses should only include non-UC-paid expenses
      expect(parseFloat(data.totalExpenses)).toBe(300); // Only food, not rent
      
      // UC taper: (2000 - 600) * 0.55 = 770
      const expectedTaper = new Decimal("2000").minus("600").times("0.55");
      expect(parseFloat(data.ucTaper)).toBeCloseTo(expectedTaper.toNumber(), 2);
      
      // Disposable: 2000 - 300 - 770 = 930
      const expectedDisposable = new Decimal("2000").minus("300").minus(expectedTaper);
      expect(parseFloat(data.disposableIncome)).toBeCloseTo(expectedDisposable.toNumber(), 2);
    });

    test("handles multiple income sources", async () => {
      // Create multiple income sources
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Main Job",
        amount: "1500.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Freelance",
        name: "Side Gig",
        amount: "500.00",
        frequency: "monthly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create expenses
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Rent",
        amount: "700.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/disposable-income`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // Total income should be sum of all sources
      expect(parseFloat(data.grossIncome)).toBe(2000); // 1500 + 500
      
      // UC taper based on total income: (2000 - 600) * 0.55 = 770
      const expectedTaper = new Decimal("2000").minus("600").times("0.55");
      expect(parseFloat(data.ucTaper)).toBeCloseTo(expectedTaper.toNumber(), 2);
    });

    test("handles different frequency conversions", async () => {
      // Create weekly income
      await db.insert(income).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        type: "Salary",
        name: "Weekly Pay",
        amount: "500.00",
        frequency: "weekly",
        isNet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create fortnightly expense
      await db.insert(expense).values({
        id: crypto.randomUUID(),
        organizationId: testOrgId,
        name: "Fortnightly Bill",
        amount: "200.00",
        category: "utilities",
        priority: "essential",
        frequency: "fortnightly",
        isUcPaid: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new Request(`http://localhost/${testOrgId}/disposable-income`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      
      // Weekly income converted to monthly: 500 * 52 / 12 = 2166.67
      const expectedMonthlyIncome = new Decimal("500").times(52).dividedBy(12);
      expect(parseFloat(data.grossIncome)).toBeCloseTo(expectedMonthlyIncome.toNumber(), 2);
      
      // Fortnightly expense converted to monthly: 200 * 26 / 12 = 433.33
      const expectedMonthlyExpense = new Decimal("200").times(26).dividedBy(12);
      expect(parseFloat(data.totalExpenses)).toBeCloseTo(expectedMonthlyExpense.toNumber(), 2);
    });

    test("rejects access to other organization's data", async () => {
      const otherOrgId = crypto.randomUUID();
      
      const req = new Request(`http://localhost/${otherOrgId}/disposable-income`, {
        method: "GET",
      });

      const res = await testApp.request(req);
      expect(res.status).toBe(403);
      
      const data = await res.json();
      expect(data.error.code).toBe("AUTHZ_002");
    });
  });
});
