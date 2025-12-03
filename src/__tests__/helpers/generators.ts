/**
 * Fast-Check Generators
 * 
 * Reusable generators for property-based testing.
 * Ensures consistent test data generation across all service tests.
 */

import fc from "fast-check";

/**
 * Generate valid frequency values
 */
export const frequencyArbitrary = fc.constantFrom(
  "weekly",
  "fortnightly",
  "monthly",
  "annual",
  "one-time"
);

/**
 * Generate valid expense category values
 */
export const expenseCategoryArbitrary = fc.constantFrom(
  "housing",
  "utilities",
  "food",
  "transport",
  "insurance",
  "childcare",
  "other"
);

/**
 * Generate valid expense priority values
 */
export const expensePriorityArbitrary = fc.constantFrom(
  "essential",
  "important",
  "discretionary"
);

/**
 * Generate valid monetary amounts (as strings with 2 decimal places)
 */
export const moneyAmountArbitrary = fc
  .double({ min: 0.01, max: 100000, noNaN: true })
  .map((n) => n.toFixed(2));

/**
 * Generate valid income data
 */
export const incomeDataArbitrary = fc.record({
  type: fc.string({ minLength: 1, maxLength: 50 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  amount: moneyAmountArbitrary,
  frequency: frequencyArbitrary,
  isNet: fc.boolean(),
});

/**
 * Generate valid expense data
 */
export const expenseDataArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  amount: moneyAmountArbitrary,
  category: expenseCategoryArbitrary,
  priority: expensePriorityArbitrary,
  frequency: frequencyArbitrary,
  isUcPaid: fc.boolean(),
  dueDay: fc.option(fc.integer({ min: 1, max: 31 }), { nil: undefined }),
});

/**
 * Generate partial update data for income
 */
export const incomeUpdateArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  amount: moneyAmountArbitrary,
});

/**
 * Generate partial update data for expense
 */
export const expenseUpdateArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  amount: moneyAmountArbitrary,
});

/**
 * Generate valid debt type values
 */
export const debtTypeArbitrary = fc.constantFrom(
  "credit-card",
  "loan",
  "overdraft",
  "ccj",
  "other"
);

/**
 * Generate valid debt status values
 */
export const debtStatusArbitrary = fc.constantFrom("active", "paid");

/**
 * Generate valid debt data
 */
export const debtDataArbitrary = fc.oneof(
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    type: debtTypeArbitrary,
    balance: moneyAmountArbitrary,
    interestRate: fc
      .double({ min: 0, max: 30, noNaN: true })
      .map((n) => n.toFixed(2)),
    minimumPayment: moneyAmountArbitrary,
    isCcj: fc.constant(true as const),
    ccjDeadline: fc
      .date({ min: new Date("2025-01-01"), max: new Date("2030-12-31") })
      .filter((d) => !isNaN(d.getTime()))
      .map((d) => d.toISOString().split("T")[0]),
  }),
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    type: debtTypeArbitrary,
    balance: moneyAmountArbitrary,
    interestRate: fc
      .double({ min: 0, max: 30, noNaN: true })
      .map((n) => n.toFixed(2)),
    minimumPayment: moneyAmountArbitrary,
    isCcj: fc.constant(false as const),
    ccjDeadline: fc.constant(undefined),
  })
);

/**
 * Generate partial update data for debt
 */
export const debtUpdateArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  balance: moneyAmountArbitrary,
});

/**
 * Generate payment amount (smaller than typical debt balance)
 */
export const paymentAmountArbitrary = fc
  .double({ min: 0.01, max: 1000, noNaN: true })
  .map((n) => n.toFixed(2));
