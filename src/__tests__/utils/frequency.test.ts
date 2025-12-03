import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import Decimal from "decimal.js";
import {
  toMonthlyEquivalent,
  fromMonthlyEquivalent,
  toAnnualTotal,
  type Frequency,
} from "../../utils/frequency";

/**
 * Property-based tests for frequency conversion utilities
 * * * These tests validate the correctness properties for frequency normalization:
 * - Property 14: Income frequency normalization
 * - Property 21: Expense frequency normalization
 */

// Arbitrary for generating monetary amounts
// We use reasonable bounds for financial amounts (0.01 to 1 million)
const moneyArbitrary = fc
  .double({ min: 0.01, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
  .map((n) => new Decimal(n.toFixed(2))); // Ensure 2 decimal places

// Arbitrary for generating frequency values (excluding 'one-time' for most tests)
const recurringFrequencyArbitrary = fc.constantFrom<Frequency>(
  'weekly',
  'fortnightly',
  'monthly',
  'annual'
);

// Arbitrary for all frequency values including 'one-time'
const allFrequencyArbitrary = fc.constantFrom<Frequency>(
  'one-time',
  'weekly',
  'fortnightly',
  'monthly',
  'annual'
);

describe("Frequency Conversion - Property-Based Tests", () => {
  /** * Property 14: Income frequency normalization * Property 21: Expense frequency normalization
   * 
   * For any income/expense with a frequency, converting to monthly equivalent
   * should produce the correct monthly amount based on the frequency.
   *   */
  describe("Property 14 & 21: Frequency normalization", () => {
    test("toMonthlyEquivalent() should produce correct monthly amounts for all frequencies", () => {
      fc.assert(
        fc.property(moneyArbitrary, recurringFrequencyArbitrary, (amount, frequency) => {
          const monthly = toMonthlyEquivalent(amount, frequency);
          
          // Verify result is a Decimal
          expect(monthly).toBeInstanceOf(Decimal);
          
          // Verify the conversion is correct by checking annual totals
          const annualFromMonthly = monthly.times(12);
          const annualDirect = toAnnualTotal(amount, frequency);
          
          // Should be equal within a small tolerance (for rounding)
          const diff = annualFromMonthly.minus(annualDirect).abs();
          expect(diff.lessThan(0.01)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("weekly frequency: amount × 52 ÷ 12", () => {
      fc.assert(
        fc.property(moneyArbitrary, (amount) => {
          const monthly = toMonthlyEquivalent(amount, 'weekly');
          const expected = amount.times(52).dividedBy(12);
          
          expect(monthly.equals(expected)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("fortnightly frequency: amount × 26 ÷ 12", () => {
      fc.assert(
        fc.property(moneyArbitrary, (amount) => {
          const monthly = toMonthlyEquivalent(amount, 'fortnightly');
          const expected = amount.times(26).dividedBy(12);
          
          expect(monthly.equals(expected)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("monthly frequency: amount (no conversion)", () => {
      fc.assert(
        fc.property(moneyArbitrary, (amount) => {
          const monthly = toMonthlyEquivalent(amount, 'monthly');
          
          expect(monthly.equals(amount)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("annual frequency: amount ÷ 12", () => {
      fc.assert(
        fc.property(moneyArbitrary, (amount) => {
          const monthly = toMonthlyEquivalent(amount, 'annual');
          const expected = amount.dividedBy(12);
          
          expect(monthly.equals(expected)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("one-time frequency: returns zero (not recurring)", () => {
      fc.assert(
        fc.property(moneyArbitrary, (amount) => {
          const monthly = toMonthlyEquivalent(amount, 'one-time');
          
          expect(monthly.equals(new Decimal(0))).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("monthly equivalent should always be non-negative", () => {
      fc.assert(
        fc.property(moneyArbitrary, allFrequencyArbitrary, (amount, frequency) => {
          const monthly = toMonthlyEquivalent(amount, frequency);
          
          expect(monthly.greaterThanOrEqualTo(0)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("round trip: toMonthly then fromMonthly preserves annual total", () => {
      fc.assert(
        fc.property(moneyArbitrary, recurringFrequencyArbitrary, (amount, frequency) => {
          // Convert to monthly
          const monthly = toMonthlyEquivalent(amount, frequency);
          
          // Convert back to original frequency
          const backToOriginal = fromMonthlyEquivalent(monthly, frequency);
          
          // Should be approximately equal (within rounding tolerance)
          const diff = backToOriginal.minus(amount).abs();
          expect(diff.lessThan(0.01)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("converting same amount with different frequencies produces different monthly values", () => {
      fc.assert(
        fc.property(moneyArbitrary, (amount) => {
          const weekly = toMonthlyEquivalent(amount, 'weekly');
          const monthly = toMonthlyEquivalent(amount, 'monthly');
          const annual = toMonthlyEquivalent(amount, 'annual');
          
          // Weekly should be higher than monthly (52/12 > 1)
          expect(weekly.greaterThan(monthly)).toBe(true);
          
          // Monthly should be higher than annual (1 > 1/12)
          expect(monthly.greaterThan(annual)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("monthly equivalent scales linearly with amount", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          recurringFrequencyArbitrary,
          fc.double({ min: 2, max: 10, noNaN: true, noDefaultInfinity: true }),
          (amount, frequency, multiplier) => {
            const monthly1 = toMonthlyEquivalent(amount, frequency);
            const monthly2 = toMonthlyEquivalent(amount.times(multiplier), frequency);
            
            // monthly2 should be approximately multiplier × monthly1
            const expected = monthly1.times(multiplier);
            const diff = monthly2.minus(expected).abs();
            
            // Allow small tolerance for rounding
            expect(diff.lessThan(0.01)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("annual total consistency: monthly × 12 = annual total", () => {
      fc.assert(
        fc.property(moneyArbitrary, recurringFrequencyArbitrary, (amount, frequency) => {
          const monthly = toMonthlyEquivalent(amount, frequency);
          const annualFromMonthly = monthly.times(12);
          const annualDirect = toAnnualTotal(amount, frequency);
          
          // Should be equal within rounding tolerance
          const diff = annualFromMonthly.minus(annualDirect).abs();
          expect(diff.lessThan(0.01)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("frequency conversion maintains precision (no floating-point errors)", () => {
      fc.assert(
        fc.property(moneyArbitrary, recurringFrequencyArbitrary, (amount, frequency) => {
          const monthly = toMonthlyEquivalent(amount, frequency);
          
          // Verify result is still a Decimal (not converted to number)
          expect(monthly).toBeInstanceOf(Decimal);
          
          // Verify precision is maintained by checking string representation
          // Decimal should not introduce floating-point artifacts
          const str = monthly.toString();
          expect(str).not.toContain('e'); // No scientific notation for reasonable values
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("edge case: very small amounts", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true }),
          recurringFrequencyArbitrary,
          (value, frequency) => {
            const amount = new Decimal(value.toFixed(2));
            const monthly = toMonthlyEquivalent(amount, frequency);
            
            // Should still be non-negative
            expect(monthly.greaterThanOrEqualTo(0)).toBe(true);
            
            // Should be a valid Decimal
            expect(monthly).toBeInstanceOf(Decimal);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("edge case: very large amounts", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 100_000, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
          recurringFrequencyArbitrary,
          (value, frequency) => {
            const amount = new Decimal(value.toFixed(2));
            const monthly = toMonthlyEquivalent(amount, frequency);
            
            // Should still be non-negative
            expect(monthly.greaterThanOrEqualTo(0)).toBe(true);
            
            // Should be a valid Decimal
            expect(monthly).toBeInstanceOf(Decimal);
            
            // Should maintain reasonable relationship to original
            const annual = toAnnualTotal(amount, frequency);
            const monthlyTimestwelve = monthly.times(12);
            const diff = monthlyTimestwelve.minus(annual).abs();
            expect(diff.lessThan(1)).toBe(true); // Within £1 tolerance for large amounts
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("specific example: £1000 weekly = £4333.33 monthly", () => {
      const amount = new Decimal(1000);
      const monthly = toMonthlyEquivalent(amount, 'weekly');
      
      // 1000 × 52 ÷ 12 = 4333.333...
      const expected = new Decimal(1000).times(52).dividedBy(12);
      expect(monthly.equals(expected)).toBe(true);
      
      // Check approximate value
      expect(monthly.toNumber()).toBeCloseTo(4333.33, 2);
    });

    test("specific example: £2400 annual = £200 monthly", () => {
      const amount = new Decimal(2400);
      const monthly = toMonthlyEquivalent(amount, 'annual');
      
      // 2400 ÷ 12 = 200
      expect(monthly.equals(new Decimal(200))).toBe(true);
    });

    test("specific example: £500 fortnightly = £1083.33 monthly", () => {
      const amount = new Decimal(500);
      const monthly = toMonthlyEquivalent(amount, 'fortnightly');
      
      // 500 × 26 ÷ 12 = 1083.333...
      const expected = new Decimal(500).times(26).dividedBy(12);
      expect(monthly.equals(expected)).toBe(true);
      
      // Check approximate value
      expect(monthly.toNumber()).toBeCloseTo(1083.33, 2);
    });
  });

  describe("Additional frequency conversion properties", () => {
    test("fromMonthlyEquivalent() inverts toMonthlyEquivalent()", () => {
      fc.assert(
        fc.property(moneyArbitrary, recurringFrequencyArbitrary, (amount, frequency) => {
          const monthly = toMonthlyEquivalent(amount, frequency);
          const backToOriginal = fromMonthlyEquivalent(monthly, frequency);
          
          // Should round-trip correctly
          const diff = backToOriginal.minus(amount).abs();
          expect(diff.lessThan(0.01)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("toAnnualTotal() produces consistent results", () => {
      fc.assert(
        fc.property(moneyArbitrary, recurringFrequencyArbitrary, (amount, frequency) => {
          const annual = toAnnualTotal(amount, frequency);
          
          // Verify it's a Decimal
          expect(annual).toBeInstanceOf(Decimal);
          
          // Verify it's non-negative
          expect(annual.greaterThanOrEqualTo(0)).toBe(true);
          
          // Verify consistency with monthly conversion
          const monthly = toMonthlyEquivalent(amount, frequency);
          const annualFromMonthly = monthly.times(12);
          const diff = annual.minus(annualFromMonthly).abs();
          expect(diff.lessThan(0.01)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
