import Decimal from 'decimal.js';

/**
 * Money utility functions for handling currency operations with precision.
 * Uses Decimal.js to avoid floating-point arithmetic errors.
 * 
 */

// Configure Decimal for money operations
// 2 decimal places for GBP, round half up
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Creates a Decimal instance from various input types
 * @param value - Number, string, or Decimal value
 * @returns Decimal instance
 */
export function money(value: number | string | Decimal): Decimal {
  return new Decimal(value);
}

/**
 * Formats a monetary amount as GBP with 2 decimal places
 * @param amount - The amount to format
 * @returns Formatted string with GBP symbol (e.g., "£1,234.56")
 */
export function formatMoney(amount: Decimal | number | string): string {
  const decimal = amount instanceof Decimal ? amount : new Decimal(amount);
  
  // Round to 2 decimal places
  const rounded = decimal.toDecimalPlaces(2);
  
  // Format with thousands separator
  const parts = rounded.toFixed(2).split('.');
  const integerPart = (parts[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimalPart = parts[1] || '00';
  
  return `£${integerPart}.${decimalPart}`;
}

/**
 * Adds two monetary amounts with precision
 * @param a - First amount
 * @param b - Second amount
 * @returns Sum as Decimal
 */
export function addMoney(a: Decimal, b: Decimal): Decimal {
  return a.plus(b);
}

/**
 * Subtracts one monetary amount from another with precision
 * @param a - Amount to subtract from
 * @param b - Amount to subtract
 * @returns Difference as Decimal
 */
export function subtractMoney(a: Decimal, b: Decimal): Decimal {
  return a.minus(b);
}

/**
 * Multiplies a monetary amount by a factor with precision
 * @param amount - The amount to multiply
 * @param factor - The multiplication factor
 * @returns Product as Decimal
 */
export function multiplyMoney(amount: Decimal, factor: number | Decimal): Decimal {
  return amount.times(factor);
}

/**
 * Divides a monetary amount by a divisor with precision
 * @param amount - The amount to divide
 * @param divisor - The division factor
 * @returns Quotient as Decimal
 */
export function divideMoney(amount: Decimal, divisor: number | Decimal): Decimal {
  return amount.dividedBy(divisor);
}

/**
 * Rounds a monetary amount to 2 decimal places
 * @param amount - The amount to round
 * @returns Rounded Decimal
 */
export function roundMoney(amount: Decimal): Decimal {
  return amount.toDecimalPlaces(2);
}

/**
 * Compares two monetary amounts
 * @param a - First amount
 * @param b - Second amount
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareMoney(a: Decimal, b: Decimal): number {
  return a.comparedTo(b);
}

/**
 * Checks if a monetary amount is zero
 * @param amount - The amount to check
 * @returns True if amount is zero
 */
export function isZero(amount: Decimal): boolean {
  return amount.isZero();
}

/**
 * Checks if a monetary amount is positive
 * @param amount - The amount to check
 * @returns True if amount is greater than zero
 */
export function isPositive(amount: Decimal): boolean {
  return amount.greaterThan(0);
}

/**
 * Checks if a monetary amount is negative
 * @param amount - The amount to check
 * @returns True if amount is less than zero
 */
export function isNegative(amount: Decimal): boolean {
  return amount.lessThan(0);
}

/**
 * Returns the absolute value of a monetary amount
 * @param amount - The amount
 * @returns Absolute value as Decimal
 */
export function absoluteMoney(amount: Decimal): Decimal {
  return amount.abs();
}

/**
 * Returns the minimum of two monetary amounts
 * @param a - First amount
 * @param b - Second amount
 * @returns Minimum value as Decimal
 */
export function minMoney(a: Decimal, b: Decimal): Decimal {
  return Decimal.min(a, b);
}

/**
 * Returns the maximum of two monetary amounts
 * @param a - First amount
 * @param b - Second amount
 * @returns Maximum value as Decimal
 */
export function maxMoney(a: Decimal, b: Decimal): Decimal {
  return Decimal.max(a, b);
}

/**
 * Sums an array of monetary amounts
 * @param amounts - Array of amounts to sum
 * @returns Total as Decimal
 */
export function sumMoney(amounts: Decimal[]): Decimal {
  return amounts.reduce((sum, amount) => sum.plus(amount), new Decimal(0));
}
