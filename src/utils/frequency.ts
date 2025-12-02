import Decimal from 'decimal.js';

/**
 * Frequency conversion utilities for normalizing income and expense frequencies.
 * Converts various payment frequencies to monthly equivalents for calculations.
 * 
 * Requirements: 3.3, 4.4
 */

/**
 * Supported frequency types for income and expenses
 */
export type Frequency = 'one-time' | 'weekly' | 'fortnightly' | 'monthly' | 'annual';

/**
 * Converts an amount with a given frequency to its monthly equivalent.
 * 
 * Conversion formulas:
 * - Weekly: amount × 52 ÷ 12 (52 weeks per year, 12 months per year)
 * - Fortnightly: amount × 26 ÷ 12 (26 fortnights per year, 12 months per year)
 * - Monthly: amount (no conversion needed)
 * - Annual: amount ÷ 12 (12 months per year)
 * - One-time: 0 (not recurring, excluded from monthly calculations)
 * 
 * @param amount - The amount to convert
 * @param frequency - The frequency of the amount
 * @returns Monthly equivalent as Decimal
 */
export function toMonthlyEquivalent(amount: Decimal, frequency: Frequency): Decimal {
  switch (frequency) {
    case 'weekly':
      // 52 weeks per year ÷ 12 months = 4.333... weeks per month
      return amount.times(52).dividedBy(12);
    
    case 'fortnightly':
      // 26 fortnights per year ÷ 12 months = 2.166... fortnights per month
      return amount.times(26).dividedBy(12);
    
    case 'monthly':
      // Already monthly, no conversion needed
      return amount;
    
    case 'annual':
      // 12 months per year
      return amount.dividedBy(12);
    
    case 'one-time':
      // One-time payments are not recurring, so they don't contribute to monthly totals
      return new Decimal(0);
    
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = frequency;
      throw new Error(`Unknown frequency: ${_exhaustive}`);
  }
}

/**
 * Converts a monthly amount to a different frequency.
 * Useful for displaying amounts in user's preferred frequency.
 * 
 * @param monthlyAmount - The monthly amount to convert
 * @param targetFrequency - The target frequency
 * @returns Amount in target frequency as Decimal
 */
export function fromMonthlyEquivalent(monthlyAmount: Decimal, targetFrequency: Frequency): Decimal {
  switch (targetFrequency) {
    case 'weekly':
      // 12 months ÷ 52 weeks per year
      return monthlyAmount.times(12).dividedBy(52);
    
    case 'fortnightly':
      // 12 months ÷ 26 fortnights per year
      return monthlyAmount.times(12).dividedBy(26);
    
    case 'monthly':
      return monthlyAmount;
    
    case 'annual':
      return monthlyAmount.times(12);
    
    case 'one-time':
      // One-time doesn't make sense for conversion from monthly
      return monthlyAmount;
    
    default:
      const _exhaustive: never = targetFrequency;
      throw new Error(`Unknown frequency: ${_exhaustive}`);
  }
}

/**
 * Calculates the annual total for an amount with a given frequency.
 * 
 * @param amount - The amount
 * @param frequency - The frequency of the amount
 * @returns Annual total as Decimal
 */
export function toAnnualTotal(amount: Decimal, frequency: Frequency): Decimal {
  switch (frequency) {
    case 'weekly':
      return amount.times(52);
    
    case 'fortnightly':
      return amount.times(26);
    
    case 'monthly':
      return amount.times(12);
    
    case 'annual':
      return amount;
    
    case 'one-time':
      // One-time payments don't have an annual total
      return amount;
    
    default:
      const _exhaustive: never = frequency;
      throw new Error(`Unknown frequency: ${_exhaustive}`);
  }
}

/**
 * Validates that a frequency value is one of the supported types.
 * 
 * @param frequency - The frequency to validate
 * @returns True if valid, false otherwise
 */
export function isValidFrequency(frequency: string): frequency is Frequency {
  return ['one-time', 'weekly', 'fortnightly', 'monthly', 'annual'].includes(frequency);
}

/**
 * Gets a human-readable label for a frequency.
 * 
 * @param frequency - The frequency
 * @returns Human-readable label
 */
export function getFrequencyLabel(frequency: Frequency): string {
  switch (frequency) {
    case 'one-time':
      return 'One-time';
    case 'weekly':
      return 'Weekly';
    case 'fortnightly':
      return 'Fortnightly';
    case 'monthly':
      return 'Monthly';
    case 'annual':
      return 'Annual';
    default:
      const _exhaustive: never = frequency;
      throw new Error(`Unknown frequency: ${_exhaustive}`);
  }
}
