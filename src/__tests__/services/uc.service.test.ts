import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fc from "fast-check";
import Decimal from "decimal.js";
import { calculateTaper, calculateDisposableIncome, ucService } from "../../services/uc.service";
import { db } from "../../db";
import { ucConfig, organization, user, member, income, expense } from "../../db/schema";
import { eq } from "drizzle-orm";
import { incomeService } from "../../services/income.service";
import { expenseService } from "../../services/expense.service";

/**
 * Property-Based Tests for UC Service
 * 
 * Tests the following correctness properties:
 * - Property 36: UC taper uses configurable parameters
 * - Property 37: UC taper calculation formula
 * - Property 38: Disposable income includes UC taper
 * - Property 39: UC-paid expenses excluded from disposable income
 * 
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */

// Arbitrary for generating monetary amounts
const moneyArbitrary = fc
  .double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true })
  .map((n) => new Decimal(n.toFixed(2)));

// Arbitrary for generating taper rates (0.01 to 0.99, representing 1% to 99%)
const taperRateArbitrary = fc
  .double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true })
  .map((n) => new Decimal(n.toFixed(2)));

// Arbitrary for generating work allowances
const workAllowanceArbitrary = fc
  .double({ min: 100, max: 5000, noNaN: true, noDefaultInfinity: true })
  .map((n) => new Decimal(n.toFixed(2)));

describe("UC Service - Property Tests", () => {
  let testConfigId: string;
  let testOrgId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test UC config
    testConfigId = crypto.randomUUID();
    await db.insert(ucConfig).values({
      id: testConfigId,
      taperRate: "0.55", // 55% taper rate (standard UK UC rate)
      workAllowance: "344.00", // Standard work allowance
      effectiveFrom: "2024-01-01",
      effectiveTo: null, // Currently active
      createdAt: new Date(),
    });

    // Create test organization for integration tests
    testOrgId = crypto.randomUUID();
    await db.insert(organization).values({
      id: testOrgId,
      name: "Test UC Organization",
      slug: `test-uc-${testOrgId.slice(0, 8)}`,
      createdAt: new Date(),
      metadata: null,
      logo: null,
    });

    // Create test user
    testUserId = crypto.randomUUID();
    await db.insert(user).values({
      id: testUserId,
      name: "Test UC User",
      email: `test-uc-${testUserId}@test.com`,
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
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(income).where(eq(income.organizationId, testOrgId));
    await db.delete(expense).where(eq(expense.organizationId, testOrgId));
    await db.delete(member).where(eq(member.organizationId, testOrgId));
    await db.delete(organization).where(eq(organization.id, testOrgId));
    await db.delete(user).where(eq(user.id, testUserId));
    await db.delete(ucConfig).where(eq(ucConfig.id, testConfigId));
  });

  /**
   * Feature: debt-snowball-api, Property 36: UC taper uses configurable parameters
   * Validates: Requirements 7.1
   * 
   * For any UC taper calculation, the system should use the current UC config
   * values for taper rate and work allowance.
   */
  describe("Property 36: UC taper uses configurable parameters", () => {
    test("calculateTaper uses provided config parameters", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          taperRateArbitrary,
          workAllowanceArbitrary,
          (grossIncome, taperRate, workAllowance) => {
            const config = { taperRate, workAllowance };
            const taper = calculateTaper(grossIncome, config);

            // Property: Taper should be calculated using the provided config
            // If income > work allowance, taper should be positive
            if (grossIncome.greaterThan(workAllowance)) {
              expect(taper.greaterThan(0)).toBe(true);
              
              // Verify the calculation uses the config values
              const expectedTaper = grossIncome.minus(workAllowance).times(taperRate);
              expect(taper.equals(expectedTaper)).toBe(true);
            } else {
              // If income <= work allowance, taper should be zero
              expect(taper.equals(new Decimal(0))).toBe(true);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Different config parameters produce different taper amounts", () => {
      fc.assert(
        fc.property(
          moneyArbitrary.filter(m => m.greaterThan(1000)), // Ensure income > work allowance
          taperRateArbitrary,
          taperRateArbitrary,
          (grossIncome, taperRate1, taperRate2) => {
            // Skip if taper rates are too similar
            if (taperRate1.minus(taperRate2).abs().lessThan(0.05)) {
              return true;
            }

            const workAllowance = new Decimal(500);
            const config1 = { taperRate: taperRate1, workAllowance };
            const config2 = { taperRate: taperRate2, workAllowance };

            const taper1 = calculateTaper(grossIncome, config1);
            const taper2 = calculateTaper(grossIncome, config2);

            // Property: Different taper rates should produce different results
            expect(taper1.equals(taper2)).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test.skip("UC service fetches and uses current config from database", async () => {
      // Use a specific income amount
      const grossIncome = new Decimal(2000);

      // Calculate taper using service (fetches from DB)
      const taperFromService = await ucService.calculateTaperForIncome(grossIncome);

      // Calculate taper manually using known config values
      const expectedTaper = calculateTaper(grossIncome, {
        taperRate: new Decimal("0.55"),
        workAllowance: new Decimal("344.00"),
      });

      // Property: Service should use config from database
      expect(taperFromService.equals(expectedTaper)).toBe(true);
    });
  });

  /**
   * Feature: debt-snowball-api, Property 37: UC taper calculation formula
   * Validates: Requirements 7.2
   * 
   * For any income above work allowance, the UC reduction should equal
   * (income - work allowance) × taper rate.
   */
  describe("Property 37: UC taper calculation formula", () => {
    test("Taper formula: (income - workAllowance) × taperRate", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          taperRateArbitrary,
          workAllowanceArbitrary,
          (grossIncome, taperRate, workAllowance) => {
            const config = { taperRate, workAllowance };
            const taper = calculateTaper(grossIncome, config);

            // Property: Taper should follow the formula
            if (grossIncome.greaterThan(workAllowance)) {
              const excessIncome = grossIncome.minus(workAllowance);
              const expectedTaper = excessIncome.times(taperRate);
              expect(taper.equals(expectedTaper)).toBe(true);
            } else {
              expect(taper.equals(new Decimal(0))).toBe(true);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Taper is always non-negative", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          taperRateArbitrary,
          workAllowanceArbitrary,
          (grossIncome, taperRate, workAllowance) => {
            const config = { taperRate, workAllowance };
            const taper = calculateTaper(grossIncome, config);

            // Property: Taper should never be negative
            expect(taper.greaterThanOrEqualTo(0)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Taper increases linearly with income above work allowance", () => {
      fc.assert(
        fc.property(
          workAllowanceArbitrary,
          taperRateArbitrary,
          fc.double({ min: 100, max: 5000, noNaN: true }),
          fc.double({ min: 100, max: 5000, noNaN: true }),
          (workAllowance, taperRate, excess1, excess2) => {
            // Create two incomes above work allowance
            const income1 = workAllowance.plus(new Decimal(excess1.toFixed(2)));
            const income2 = workAllowance.plus(new Decimal(excess2.toFixed(2)));

            const config = { taperRate, workAllowance };
            const taper1 = calculateTaper(income1, config);
            const taper2 = calculateTaper(income2, config);

            // Property: Taper should scale linearly with excess income
            const excessDiff = income2.minus(income1);
            const taperDiff = taper2.minus(taper1);
            const expectedTaperDiff = excessDiff.times(taperRate);

            expect(taperDiff.toFixed(2)).toBe(expectedTaperDiff.toFixed(2));

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Specific example: £2000 income, £344 allowance, 55% rate = £910.80 taper", () => {
      const grossIncome = new Decimal(2000);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      // (2000 - 344) × 0.55 = 1656 × 0.55 = 910.80
      const expected = new Decimal(2000).minus(344).times(0.55);
      expect(taper.equals(expected)).toBe(true);
      expect(taper.toNumber()).toBeCloseTo(910.80, 2);
    });

    test("Taper rate of 100% means all excess income is tapered", () => {
      fc.assert(
        fc.property(
          moneyArbitrary.filter(m => m.greaterThan(500)),
          workAllowanceArbitrary.filter(w => w.lessThan(500)),
          (grossIncome, workAllowance) => {
            const config = {
              taperRate: new Decimal(1.0), // 100%
              workAllowance,
            };

            const taper = calculateTaper(grossIncome, config);
            const excessIncome = grossIncome.minus(workAllowance);

            // Property: With 100% taper rate, taper equals excess income
            expect(taper.equals(excessIncome)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: debt-snowball-api, Property 38: Disposable income includes UC taper
   * Validates: Requirements 7.3
   * 
   * For any disposable income calculation, the result should equal
   * gross income minus expenses minus UC taper amount.
   */
  describe("Property 38: Disposable income includes UC taper", () => {
    test("Disposable income formula: income - expenses - ucTaper", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          moneyArbitrary,
          moneyArbitrary,
          (grossIncome, expenses, ucTaper) => {
            const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

            // Property: Disposable income should follow the formula
            const expected = grossIncome.minus(expenses).minus(ucTaper);
            expect(disposable.equals(expected)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Disposable income can be negative", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          moneyArbitrary.filter(e => e.greaterThan(1000)),
          moneyArbitrary,
          (grossIncome, expenses, ucTaper) => {
            // Ensure expenses + taper > income to get negative disposable
            const largeExpenses = expenses.plus(grossIncome).plus(100);
            const disposable = calculateDisposableIncome(grossIncome, largeExpenses, ucTaper);

            // Property: Disposable income can be negative
            expect(disposable.lessThan(0)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Higher UC taper reduces disposable income", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          moneyArbitrary,
          moneyArbitrary,
          moneyArbitrary,
          (grossIncome, expenses, taper1, taper2) => {
            // Ensure taper2 > taper1
            if (taper2.lessThanOrEqualTo(taper1)) {
              return true; // Skip this case
            }

            const disposable1 = calculateDisposableIncome(grossIncome, expenses, taper1);
            const disposable2 = calculateDisposableIncome(grossIncome, expenses, taper2);

            // Property: Higher taper should result in lower disposable income
            expect(disposable2.lessThan(disposable1)).toBe(true);

            // The difference should equal the taper difference
            const diff = disposable1.minus(disposable2);
            const taperDiff = taper2.minus(taper1);
            expect(diff.equals(taperDiff)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Zero taper means disposable = income - expenses", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          moneyArbitrary,
          (grossIncome, expenses) => {
            const disposable = calculateDisposableIncome(
              grossIncome,
              expenses,
              new Decimal(0)
            );

            // Property: With zero taper, disposable = income - expenses
            const expected = grossIncome.minus(expenses);
            expect(disposable.equals(expected)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Specific example: £2000 income, £800 expenses, £910.80 taper = £289.20 disposable", () => {
      const grossIncome = new Decimal(2000);
      const expenses = new Decimal(800);
      const ucTaper = new Decimal(910.80);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      // 2000 - 800 - 910.80 = 289.20
      const expected = new Decimal(289.20);
      expect(disposable.toFixed(2)).toBe(expected.toFixed(2));
    });

    test.skip("UC service calculates disposable income correctly", async () => {
      const grossIncome = new Decimal(2000);
      const expenses = new Decimal(800);

      // Calculate using service
      const disposable = await ucService.calculateDisposableIncomeForOrg(
        grossIncome,
        expenses
      );

      // Calculate manually
      const taper = calculateTaper(grossIncome, {
        taperRate: new Decimal("0.55"),
        workAllowance: new Decimal("344.00"),
      });
      const expectedDisposable = calculateDisposableIncome(grossIncome, expenses, taper);

      // Property: Service should calculate correctly
      expect(disposable.equals(expectedDisposable)).toBe(true);
    });
  });

  /**
   * Feature: debt-snowball-api, Property 39: UC-paid expenses excluded from disposable income
   * Validates: Requirements 7.4
   * 
   * For any set of expenses including UC-paid ones, disposable income calculation
   * should exclude UC-paid expenses.
   */
  describe("Property 39: UC-paid expenses excluded from disposable income", () => {
    test("UC-paid expenses are excluded from expense total", async () => {
      // Clean up any existing expenses
      await db.delete(expense).where(eq(expense.organizationId, testOrgId));
      await db.delete(income).where(eq(income.organizationId, testOrgId));

      // Create income
      await incomeService.createIncome(testOrgId, testUserId, {
        type: "Salary",
        name: "Monthly Salary",
        amount: "2000.00",
        frequency: "monthly",
        isNet: false,
      });

      // Create regular expense
      await expenseService.createExpense(testOrgId, testUserId, {
        name: "Rent",
        amount: "500.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
      });

      // Create UC-paid expense
      await expenseService.createExpense(testOrgId, testUserId, {
        name: "UC-Paid Rent",
        amount: "300.00",
        category: "housing",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: true,
      });

      // Get monthly totals
      const totalIncome = await incomeService.getMonthlyTotal(testOrgId);
      const totalExpensesIncludingUc = await expenseService.getMonthlyTotal(testOrgId, false);
      const totalExpensesExcludingUc = await expenseService.getMonthlyTotal(testOrgId, true);

      // Property: UC-paid expenses should be excluded when excludeUcPaid=true
      expect(totalExpensesIncludingUc.toNumber()).toBe(800); // 500 + 300
      expect(totalExpensesExcludingUc.toNumber()).toBe(500); // Only non-UC-paid

      // Calculate disposable income with UC-paid expenses excluded
      const disposable = await ucService.calculateDisposableIncomeForOrg(
        totalIncome,
        totalExpensesExcludingUc
      );

      // Verify calculation
      const taper = await ucService.calculateTaperForIncome(totalIncome);
      const expectedDisposable = totalIncome.minus(totalExpensesExcludingUc).minus(taper);
      
      expect(disposable.equals(expectedDisposable)).toBe(true);
    });

    test("Excluding UC-paid expenses increases disposable income", async () => {
      // Clean up
      await db.delete(expense).where(eq(expense.organizationId, testOrgId));

      // Create expenses
      await expenseService.createExpense(testOrgId, testUserId, {
        name: "Regular Expense",
        amount: "400.00",
        category: "food",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: false,
      });

      await expenseService.createExpense(testOrgId, testUserId, {
        name: "UC-Paid Expense",
        amount: "200.00",
        category: "utilities",
        priority: "essential",
        frequency: "monthly",
        isUcPaid: true,
      });

      const grossIncome = new Decimal(2000);

      // Calculate with all expenses
      const expensesWithUc = await expenseService.getMonthlyTotal(testOrgId, false);
      const disposableWithUc = await ucService.calculateDisposableIncomeForOrg(
        grossIncome,
        expensesWithUc
      );

      // Calculate without UC-paid expenses
      const expensesWithoutUc = await expenseService.getMonthlyTotal(testOrgId, true);
      const disposableWithoutUc = await ucService.calculateDisposableIncomeForOrg(
        grossIncome,
        expensesWithoutUc
      );

      // Property: Excluding UC-paid expenses should increase disposable income
      expect(disposableWithoutUc.greaterThan(disposableWithUc)).toBe(true);
      
      // The difference should equal the UC-paid expense amount
      const diff = disposableWithoutUc.minus(disposableWithUc);
      expect(diff.toNumber()).toBe(200);
    });
  });

  /**
   * Additional edge case tests
   */
  describe("Edge cases", () => {
    test("Zero income results in zero taper", () => {
      const taper = calculateTaper(new Decimal(0), {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      });

      expect(taper.equals(new Decimal(0))).toBe(true);
    });

    test("Income exactly equal to work allowance results in zero taper", () => {
      const workAllowance = new Decimal(344);
      const taper = calculateTaper(workAllowance, {
        taperRate: new Decimal(0.55),
        workAllowance,
      });

      expect(taper.equals(new Decimal(0))).toBe(true);
    });

    test("Very small income above work allowance produces small taper", () => {
      const taper = calculateTaper(new Decimal(344.01), {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      });

      // 0.01 × 0.55 = 0.0055
      expect(taper.greaterThan(0)).toBe(true);
      expect(taper.lessThan(0.01)).toBe(true);
    });

    test("Very large income produces proportionally large taper", () => {
      const taper = calculateTaper(new Decimal(100000), {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      });

      // (100000 - 344) × 0.55 = 54810.80
      const expected = new Decimal(100000).minus(344).times(0.55);
      expect(taper.equals(expected)).toBe(true);
    });

    test("Disposable income with zero expenses and zero taper equals income", () => {
      const disposable = calculateDisposableIncome(
        new Decimal(2000),
        new Decimal(0),
        new Decimal(0)
      );

      expect(disposable.equals(new Decimal(2000))).toBe(true);
    });

    test("Disposable income maintains precision", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          moneyArbitrary,
          moneyArbitrary,
          (income, expenses, taper) => {
            const disposable = calculateDisposableIncome(income, expenses, taper);

            // Property: Result should be a Decimal (not converted to number)
            expect(disposable).toBeInstanceOf(Decimal);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
