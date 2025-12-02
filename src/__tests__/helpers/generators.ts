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
