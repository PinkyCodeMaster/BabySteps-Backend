import { describe, test, expect } from "bun:test";
import {
  orderDebts,
  calculateMonthlyPayments,
  calculateRollover,
  projectDebtFreeDate,
  type DebtRecord,
} from "../../services/snowball.service";
import Decimal from "decimal.js";
import fc from "fast-check";

/**
 * Property-Based Tests for Snowball Service
 * 
 * Tests the following correctness properties:
 * - Property 30: CCJ debts prioritized by deadline
 * - Property 31: Non-CCJ debts ordered by balance
 * - Property 32: Payment rollover on debt payoff
 * - Property 33: Monthly payment calculation
 * - Property 35: Debt-free date projection accuracy
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.6
 */

// Helper to create a debt record
function createDebt(
  id: string,
  name: string,
  balance: string,
  interestRate: string,
  minimumPayment: string,
  isCcj: boolean,
  ccjDeadline?: string
): DebtRecord {
  return {
    id,
    organizationId: "test-org",
    name,
    type: "loan",
    balance,
    interestRate,
    minimumPayment,
    isCcj,
    ccjDeadline: ccjDeadline || null,
    status: "active",
    snowballPosition: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Arbitraries for property testing
const debtBalanceArb = fc.double({ min: 100, max: 50000, noNaN: true }).map((n) => n.toFixed(2));
const interestRateArb = fc.double({ min: 0, max: 30, noNaN: true }).map((n) => n.toFixed(2));
const minimumPaymentArb = fc.double({ min: 10, max: 500, noNaN: true }).map((n) => n.toFixed(2));
const disposableIncomeArb = fc.double({ min: 100, max: 5000, noNaN: true }).map((n) => n.toFixed(2));

const ccjDeadlineArb = fc.date({ min: new Date("2025-01-01"), max: new Date("2027-12-31") })
  .map((d) => d.toISOString().split("T")[0]!);

const nonCcjDebtArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  balance: debtBalanceArb,
  interestRate: interestRateArb,
  minimumPayment: minimumPaymentArb,
}).map((data) => createDebt(
  data.id,
  data.name,
  data.balance,
  data.interestRate,
  data.minimumPayment,
  false
));

const ccjDebtArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  balance: debtBalanceArb,
  interestRate: interestRateArb,
  minimumPayment: minimumPaymentArb,
  ccjDeadline: ccjDeadlineArb,
}).map((data) => createDebt(
  data.id,
  data.name,
  data.balance,
  data.interestRate,
  data.minimumPayment,
  true,
  data.ccjDeadline
));

describe("Snowball Service - Property Tests", () => {
  /**
   * Feature: debt-snowball-api, Property 30: CCJ debts prioritized by deadline
   * Validates: Requirements 6.1
   * 
   * For any set of debts including CCJ debts, the snowball order should prioritize
   * CCJ debts by earliest deadline first.
   */
  describe("Property 30: CCJ debts prioritized by deadline", () => {
    test("CCJ debts come before non-CCJ debts", () => {
      fc.assert(
        fc.property(
          fc.array(ccjDebtArb, { minLength: 1, maxLength: 5 }),
          fc.array(nonCcjDebtArb, { minLength: 1, maxLength: 5 }),
          (ccjDebts, nonCcjDebts) => {
            const allDebts = [...ccjDebts, ...nonCcjDebts];
            const ordered = orderDebts(allDebts);

            // Property: All CCJ debts should come before all non-CCJ debts
            const firstNonCcjIndex = ordered.findIndex((d) => !d.isCcj);
            if (firstNonCcjIndex === -1) {
              // All debts are CCJ, that's fine
              return true;
            }

            // Check that no CCJ debts appear after the first non-CCJ debt
            const ccjAfterNonCcj = ordered.slice(firstNonCcjIndex).some((d) => d.isCcj);
            expect(ccjAfterNonCcj).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("CCJ debts are ordered by earliest deadline first", () => {
      fc.assert(
        fc.property(
          fc.array(ccjDebtArb, { minLength: 2, maxLength: 10 }),
          (ccjDebts) => {
            const ordered = orderDebts(ccjDebts);

            // Property: CCJ debts should be in ascending order by deadline
            for (let i = 0; i < ordered.length - 1; i++) {
              const current = ordered[i]!;
              const next = ordered[i + 1]!;

              if (current.ccjDeadline && next.ccjDeadline) {
                const currentDate = new Date(current.ccjDeadline).getTime();
                const nextDate = new Date(next.ccjDeadline).getTime();
                expect(currentDate).toBeLessThanOrEqual(nextDate);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Mixed CCJ and non-CCJ debts maintain correct order", () => {
      // Create specific test case with known dates and balances
      const debt1 = createDebt("1", "CCJ Late", "1000.00", "10.00", "50.00", true, "2026-12-01");
      const debt2 = createDebt("2", "CCJ Early", "2000.00", "10.00", "100.00", true, "2026-01-01");
      const debt3 = createDebt("3", "Non-CCJ Small", "500.00", "15.00", "25.00", false);
      const debt4 = createDebt("4", "Non-CCJ Large", "3000.00", "12.00", "150.00", false);

      const ordered = orderDebts([debt1, debt2, debt3, debt4]);

      // Property: Order should be CCJ Early, CCJ Late, Non-CCJ Small, Non-CCJ Large
      expect(ordered[0]?.id).toBe("2"); // CCJ Early (2026-01-01)
      expect(ordered[1]?.id).toBe("1"); // CCJ Late (2026-12-01)
      expect(ordered[2]?.id).toBe("3"); // Non-CCJ Small (500)
      expect(ordered[3]?.id).toBe("4"); // Non-CCJ Large (3000)
    });
  });

  /**
   * Feature: debt-snowball-api, Property 31: Non-CCJ debts ordered by balance
   * Validates: Requirements 6.2
   * 
   * For any set of non-CCJ debts, the snowball order should sort them by
   * smallest balance first.
   */
  describe("Property 31: Non-CCJ debts ordered by balance", () => {
    test("Non-CCJ debts are ordered by smallest balance first", () => {
      fc.assert(
        fc.property(
          fc.array(nonCcjDebtArb, { minLength: 2, maxLength: 10 }),
          (debts) => {
            const ordered = orderDebts(debts);

            // Property: Non-CCJ debts should be in ascending order by balance
            for (let i = 0; i < ordered.length - 1; i++) {
              const current = ordered[i]!;
              const next = ordered[i + 1]!;

              const currentBalance = new Decimal(current.balance);
              const nextBalance = new Decimal(next.balance);

              expect(currentBalance.lessThanOrEqualTo(nextBalance)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Specific balance ordering", () => {
      const debt1 = createDebt("1", "Large", "5000.00", "10.00", "250.00", false);
      const debt2 = createDebt("2", "Small", "500.00", "15.00", "25.00", false);
      const debt3 = createDebt("3", "Medium", "2000.00", "12.00", "100.00", false);

      const ordered = orderDebts([debt1, debt2, debt3]);

      // Property: Should be ordered Small, Medium, Large
      expect(ordered[0]?.id).toBe("2"); // 500
      expect(ordered[1]?.id).toBe("3"); // 2000
      expect(ordered[2]?.id).toBe("1"); // 5000
    });
  });

  /**
   * Feature: debt-snowball-api, Property 32: Payment rollover on debt payoff
   * Validates: Requirements 6.3
   * 
   * For any debt that is paid off, the system should roll over its payment amount
   * to the next debt in the snowball.
   */
  describe("Property 32: Payment rollover on debt payoff", () => {
    test("Rollover adds current payment to next debt minimum", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 50, max: 1000, noNaN: true }),
          fc.double({ min: 25, max: 500, noNaN: true }),
          (currentPayment, nextMinimum) => {
            const current = new Decimal(currentPayment);
            const next = new Decimal(nextMinimum);

            const rollover = calculateRollover(current, next);

            // Property: Rollover should equal current payment + next minimum
            const expected = current.plus(next);
            expect(rollover.toFixed(2)).toBe(expected.toFixed(2));
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Rollover is commutative in addition", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 50, max: 1000, noNaN: true }),
          fc.double({ min: 25, max: 500, noNaN: true }),
          (a, b) => {
            const rollover1 = calculateRollover(new Decimal(a), new Decimal(b));
            const rollover2 = calculateRollover(new Decimal(b), new Decimal(a));

            // Property: a + b = b + a
            expect(rollover1.toFixed(2)).toBe(rollover2.toFixed(2));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: debt-snowball-api, Property 33: Monthly payment calculation
   * Validates: Requirements 6.4
   * 
   * For any set of debts and disposable income, the monthly payment should equal
   * the sum of all minimum payments plus extra payment on the focused debt.
   */
  describe("Property 33: Monthly payment calculation", () => {
    test("Total payment equals disposable income when sufficient", () => {
      fc.assert(
        fc.property(
          fc.array(nonCcjDebtArb, { minLength: 1, maxLength: 5 }),
          disposableIncomeArb,
          (debts, income) => {
            const disposableIncome = new Decimal(income);
            const totalMinimums = debts.reduce(
              (sum, d) => sum.plus(new Decimal(d.minimumPayment)),
              new Decimal(0)
            );

            // Only test when disposable income covers minimums
            if (disposableIncome.lessThan(totalMinimums)) {
              return;
            }

            const schedule = calculateMonthlyPayments(debts, disposableIncome);

            // Property: Total monthly payment should equal disposable income
            expect(schedule.totalMonthlyPayment.toFixed(2)).toBe(disposableIncome.toFixed(2));
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Focused debt gets minimum plus extra funds", () => {
      fc.assert(
        fc.property(
          fc.array(nonCcjDebtArb, { minLength: 2, maxLength: 5 }),
          disposableIncomeArb,
          (debts, income) => {
            const disposableIncome = new Decimal(income);
            const totalMinimums = debts.reduce(
              (sum, d) => sum.plus(new Decimal(d.minimumPayment)),
              new Decimal(0)
            );

            // Only test when disposable income covers minimums
            if (disposableIncome.lessThan(totalMinimums)) {
              return;
            }

            const schedule = calculateMonthlyPayments(debts, disposableIncome);

            if (schedule.debts.length === 0) {
              return;
            }

            const focusedDebt = schedule.debts[0]!;
            const extraFunds = disposableIncome.minus(totalMinimums);

            // Property: Focused debt payment = minimum + extra
            const expectedPayment = focusedDebt.minimumPayment.plus(extraFunds);
            expect(focusedDebt.monthlyPayment.toFixed(2)).toBe(expectedPayment.toFixed(2));
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Non-focused debts get only minimum payment", () => {
      fc.assert(
        fc.property(
          fc.array(nonCcjDebtArb, { minLength: 2, maxLength: 5 }),
          disposableIncomeArb,
          (debts, income) => {
            const disposableIncome = new Decimal(income);
            const totalMinimums = debts.reduce(
              (sum, d) => sum.plus(new Decimal(d.minimumPayment)),
              new Decimal(0)
            );

            // Only test when disposable income covers minimums
            if (disposableIncome.lessThan(totalMinimums)) {
              return;
            }

            const schedule = calculateMonthlyPayments(debts, disposableIncome);

            // Property: All non-focused debts get only their minimum payment
            for (let i = 1; i < schedule.debts.length; i++) {
              const debt = schedule.debts[i]!;
              expect(debt.monthlyPayment.toFixed(2)).toBe(debt.minimumPayment.toFixed(2));
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Empty debt list returns zero payment", () => {
      const schedule = calculateMonthlyPayments([], new Decimal(1000));

      expect(schedule.debts.length).toBe(0);
      expect(schedule.totalMonthlyPayment.toFixed(2)).toBe("0.00");
    });
  });

  /**
   * Feature: debt-snowball-api, Property 35: Debt-free date projection accuracy
   * Validates: Requirements 6.6
   * 
   * For any set of debts and monthly payment amount, the projected debt-free date
   * should be the month and year when all debts reach zero balance accounting for interest.
   */
  describe("Property 35: Debt-free date projection accuracy", () => {
    test("Empty debt list returns immediate debt-free date", () => {
      const projection = projectDebtFreeDate([], new Decimal(1000));

      expect(projection.debtFreeDate).toBeDefined();
      expect(projection.monthsToDebtFree).toBe(0);
      expect(projection.schedule.length).toBe(0);
    });

    test("Insufficient payment returns null debt-free date", () => {
      const debt = createDebt("1", "Test", "1000.00", "10.00", "100.00", false);
      const projection = projectDebtFreeDate([debt], new Decimal(50)); // Less than minimum

      expect(projection.debtFreeDate).toBeNull();
      expect(projection.monthsToDebtFree).toBeNull();
    });

    test("Single debt with no interest pays off correctly", () => {
      const debt = createDebt("1", "Test", "1000.00", "0.00", "100.00", false);
      const projection = projectDebtFreeDate([debt], new Decimal(100));

      // With 0% interest and $100/month payment on $1000 balance = 10 months
      expect(projection.monthsToDebtFree).toBe(10);
      expect(projection.debtFreeDate).toBeDefined();
    });

    test("Projection schedule has correct number of months", () => {
      fc.assert(
        fc.property(
          fc.array(nonCcjDebtArb, { minLength: 1, maxLength: 3 }),
          fc.double({ min: 500, max: 2000, noNaN: true }),
          (debts, payment) => {
            const monthlyPayment = new Decimal(payment);
            const projection = projectDebtFreeDate(debts, monthlyPayment);

            if (projection.debtFreeDate === null) {
              // Insufficient payment, skip
              return;
            }

            // Property: Schedule length should equal months to debt free
            expect(projection.schedule.length).toBe(projection.monthsToDebtFree);
          }
        ),
        { numRuns: 20 } // Fewer runs since this is computationally expensive
      );
    });

    test("All debts are paid off in final month", () => {
      fc.assert(
        fc.property(
          fc.array(nonCcjDebtArb, { minLength: 1, maxLength: 3 }),
          fc.double({ min: 500, max: 2000, noNaN: true }),
          (debts, payment) => {
            const monthlyPayment = new Decimal(payment);
            const projection = projectDebtFreeDate(debts, monthlyPayment);

            if (projection.debtFreeDate === null || projection.schedule.length === 0) {
              return;
            }

            // Property: All debts should be paid off in the final month
            const finalMonth = projection.schedule[projection.schedule.length - 1]!;
            const allPaidOff = finalMonth.debts.every((d) => d.isPaidOff);
            expect(allPaidOff).toBe(true);
          }
        ),
        { numRuns: 20 }
      );
    });

    test("Balances never go negative", () => {
      fc.assert(
        fc.property(
          fc.array(nonCcjDebtArb, { minLength: 1, maxLength: 3 }),
          fc.double({ min: 500, max: 2000, noNaN: true }),
          (debts, payment) => {
            const monthlyPayment = new Decimal(payment);
            const projection = projectDebtFreeDate(debts, monthlyPayment);

            if (projection.schedule.length === 0) {
              return;
            }

            // Property: No debt balance should ever be negative
            for (const month of projection.schedule) {
              for (const debt of month.debts) {
                expect(debt.endingBalance.greaterThanOrEqualTo(0)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test("CCJ debts are paid before non-CCJ debts", () => {
      const ccjDebt = createDebt("1", "CCJ", "500.00", "10.00", "50.00", true, "2026-06-01");
      const nonCcjDebt = createDebt("2", "Regular", "500.00", "10.00", "50.00", false);

      const projection = projectDebtFreeDate([ccjDebt, nonCcjDebt], new Decimal(200));

      if (projection.schedule.length === 0) {
        return;
      }

      // Find when each debt is paid off
      let ccjPaidOffMonth = -1;
      let nonCcjPaidOffMonth = -1;

      for (let i = 0; i < projection.schedule.length; i++) {
        const month = projection.schedule[i]!;
        const ccjDebtInMonth = month.debts.find((d) => d.debtId === "1");
        const nonCcjDebtInMonth = month.debts.find((d) => d.debtId === "2");

        if (ccjDebtInMonth?.isPaidOff && ccjPaidOffMonth === -1) {
          ccjPaidOffMonth = i;
        }
        if (nonCcjDebtInMonth?.isPaidOff && nonCcjPaidOffMonth === -1) {
          nonCcjPaidOffMonth = i;
        }
      }

      // Property: CCJ debt should be paid off before or at same time as non-CCJ debt
      if (ccjPaidOffMonth !== -1 && nonCcjPaidOffMonth !== -1) {
        expect(ccjPaidOffMonth).toBeLessThanOrEqual(nonCcjPaidOffMonth);
      }
    });
  });

  /**
   * Integration tests combining multiple properties
   */
  describe("Integration: Snowball method end-to-end", () => {
    test("Complete snowball flow with multiple debts", () => {
      const debts = [
        createDebt("1", "Small Loan", "500.00", "15.00", "50.00", false),
        createDebt("2", "Credit Card", "2000.00", "18.00", "100.00", false),
        createDebt("3", "CCJ Debt", "1500.00", "10.00", "75.00", true, "2026-03-01"),
      ];

      // Order debts
      const ordered = orderDebts(debts);

      // CCJ should be first
      expect(ordered[0]?.id).toBe("3");
      // Then smallest balance
      expect(ordered[1]?.id).toBe("1");
      // Then larger balance
      expect(ordered[2]?.id).toBe("2");

      // Calculate payments with $500/month disposable income
      const schedule = calculateMonthlyPayments(ordered, new Decimal(500));

      // Total should be $500
      expect(schedule.totalMonthlyPayment.toFixed(2)).toBe("500.00");

      // Focused debt (CCJ) should get extra
      const focusedPayment = schedule.debts[0]!.monthlyPayment;
      const totalMinimums = new Decimal(50 + 100 + 75); // 225
      const expectedFocused = new Decimal(75).plus(new Decimal(500).minus(totalMinimums));
      expect(focusedPayment.toFixed(2)).toBe(expectedFocused.toFixed(2));

      // Project debt-free date
      const projection = projectDebtFreeDate(ordered, new Decimal(500));

      expect(projection.debtFreeDate).toBeDefined();
      expect(projection.monthsToDebtFree).toBeGreaterThan(0);
    });
  });
});
