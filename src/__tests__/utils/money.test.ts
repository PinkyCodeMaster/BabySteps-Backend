import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import Decimal from "decimal.js";
import {
  money,
  formatMoney,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  roundMoney,
  sumMoney,
} from "../../utils/money";

/**
 * Property-based tests for money utilities
 * 
 * Feature: debt-snowball-api
 * These tests validate the correctness properties for money handling:
 * - Property 56: Decimal precision for money storage
 * - Property 59: Money formatting consistency
 * - Property 60: Calculation precision maintenance
 */

// Arbitrary for generating monetary amounts
// We use reasonable bounds for financial amounts (0 to 1 million)
const moneyArbitrary = fc
  .double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
  .map((n) => new Decimal(n.toFixed(2))); // Ensure 2 decimal places

// Arbitrary for generating positive monetary amounts
const positiveMoneyArbitrary = fc
  .double({ min: 0.01, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
  .map((n) => new Decimal(n.toFixed(2)));

// Arbitrary for generating small positive factors (for multiplication/division)
const factorArbitrary = fc.double({
  min: 0.01,
  max: 100,
  noNaN: true,
  noDefaultInfinity: true,
});

describe("Money Utilities - Property-Based Tests", () => {
  /**
   * Feature: debt-snowball-api, Property 56: Decimal precision for money storage
   * 
   * For any monetary amount stored, the system should use decimal precision
   * (not floating-point) to avoid rounding errors.
   * 
   * Validates: Requirements 12.1
   */
  describe("Property 56: Decimal precision for money storage", () => {
    test("money() should create Decimal instances, not floating-point numbers", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
          (value) => {
            const result = money(value);
            
            // Verify it's a Decimal instance
            expect(result).toBeInstanceOf(Decimal);
            
            // Verify it's not a regular JavaScript number
            expect(typeof result).not.toBe("number");
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("money() should preserve precision for string inputs", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
          (value) => {
            const stringValue = value.toFixed(2);
            const result = money(stringValue);
            
            // Verify the value is preserved (Decimal normalizes representation)
            // e.g., "0.00" becomes "0", "1.50" becomes "1.5"
            const expected = new Decimal(stringValue);
            expect(result.equals(expected)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Decimal operations should avoid floating-point errors", () => {
      fc.assert(
        fc.property(moneyArbitrary, moneyArbitrary, (a, b) => {
          // Classic floating-point error example: 0.1 + 0.2 !== 0.3
          // With Decimal, this should work correctly
          const sum = addMoney(a, b);
          
          // Verify the result is a Decimal
          expect(sum).toBeInstanceOf(Decimal);
          
          // Verify precision is maintained (no floating-point drift)
          const expected = new Decimal(a).plus(new Decimal(b));
          expect(sum.toString()).toBe(expected.toString());
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("money() should handle edge case: 0.1 + 0.2 = 0.3 exactly", () => {
      const a = money("0.1");
      const b = money("0.2");
      const sum = addMoney(a, b);
      
      // This would fail with floating-point: 0.1 + 0.2 = 0.30000000000000004
      expect(sum.toString()).toBe("0.3");
    });
  });

  /**
   * Feature: debt-snowball-api, Property 59: Money formatting consistency
   * 
   * For any monetary amount displayed, the format should include two decimal
   * places and GBP currency symbol.
   * 
   * Validates: Requirements 12.4
   */
  describe("Property 59: Money formatting consistency", () => {
    test("formatMoney() should always include GBP symbol", () => {
      fc.assert(
        fc.property(moneyArbitrary, (amount) => {
          const formatted = formatMoney(amount);
          
          // Must start with £ symbol
          expect(formatted.startsWith("£")).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("formatMoney() should always have exactly 2 decimal places", () => {
      fc.assert(
        fc.property(moneyArbitrary, (amount) => {
          const formatted = formatMoney(amount);
          
          // Remove £ and thousands separators
          const numericPart = formatted.replace(/[£,]/g, "");
          
          // Check decimal places
          const parts = numericPart.split(".");
          expect(parts).toHaveLength(2);
          expect(parts[1]).toHaveLength(2);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("formatMoney() should format zero correctly", () => {
      const formatted = formatMoney(new Decimal(0));
      expect(formatted).toBe("£0.00");
    });

    test("formatMoney() should include thousands separators for large amounts", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1000, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
          (value) => {
            const amount = new Decimal(value);
            const formatted = formatMoney(amount);
            
            // If amount >= 1000, should have comma separator
            if (amount.greaterThanOrEqualTo(1000)) {
              expect(formatted).toContain(",");
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("formatMoney() should round to 2 decimal places", () => {
      // Test with a value that has more than 2 decimal places
      const amount = new Decimal("123.456789");
      const formatted = formatMoney(amount);
      
      // Should round to 2 decimal places (123.46 with ROUND_HALF_UP)
      expect(formatted).toBe("£123.46");
    });

    test("formatMoney() should handle negative amounts", () => {
      fc.assert(
        fc.property(
          fc.double({ min: -1_000_000, max: -0.01, noNaN: true, noDefaultInfinity: true }),
          (value) => {
            const amount = new Decimal(value);
            const formatted = formatMoney(amount);
            
            // Should still have £ symbol and 2 decimal places
            expect(formatted.startsWith("£-") || formatted.startsWith("-£")).toBe(true);
            
            const numericPart = formatted.replace(/[£,\-]/g, "");
            const parts = numericPart.split(".");
            expect(parts[1]).toHaveLength(2);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: debt-snowball-api, Property 60: Calculation precision maintenance
   * 
   * For any arithmetic operation on money, the system should maintain decimal
   * precision throughout all intermediate calculations.
   * 
   * Validates: Requirements 12.5
   */
  describe("Property 60: Calculation precision maintenance", () => {
    test("addMoney() should maintain precision", () => {
      fc.assert(
        fc.property(moneyArbitrary, moneyArbitrary, (a, b) => {
          const sum = addMoney(a, b);
          
          // Verify result is Decimal
          expect(sum).toBeInstanceOf(Decimal);
          
          // Verify precision: sum should equal a + b exactly
          const expected = new Decimal(a).plus(new Decimal(b));
          expect(sum.equals(expected)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("subtractMoney() should maintain precision", () => {
      fc.assert(
        fc.property(moneyArbitrary, moneyArbitrary, (a, b) => {
          const diff = subtractMoney(a, b);
          
          // Verify result is Decimal
          expect(diff).toBeInstanceOf(Decimal);
          
          // Verify precision: diff should equal a - b exactly
          const expected = new Decimal(a).minus(new Decimal(b));
          expect(diff.equals(expected)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("multiplyMoney() should maintain precision", () => {
      fc.assert(
        fc.property(moneyArbitrary, factorArbitrary, (amount, factor) => {
          const product = multiplyMoney(amount, factor);
          
          // Verify result is Decimal
          expect(product).toBeInstanceOf(Decimal);
          
          // Verify precision: product should equal amount * factor exactly
          const expected = new Decimal(amount).times(factor);
          expect(product.equals(expected)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("divideMoney() should maintain precision", () => {
      fc.assert(
        fc.property(moneyArbitrary, factorArbitrary, (amount, divisor) => {
          const quotient = divideMoney(amount, divisor);
          
          // Verify result is Decimal
          expect(quotient).toBeInstanceOf(Decimal);
          
          // Verify precision: quotient should equal amount / divisor exactly
          const expected = new Decimal(amount).dividedBy(divisor);
          expect(quotient.equals(expected)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("roundMoney() should maintain 2 decimal places", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
          (value) => {
            const amount = new Decimal(value);
            const rounded = roundMoney(amount);
            
            // Verify result is Decimal
            expect(rounded).toBeInstanceOf(Decimal);
            
            // Verify it has at most 2 decimal places
            const decimalPlaces = rounded.decimalPlaces();
            expect(decimalPlaces).toBeLessThanOrEqual(2);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("sumMoney() should maintain precision for multiple amounts", () => {
      fc.assert(
        fc.property(fc.array(moneyArbitrary, { minLength: 1, maxLength: 10 }), (amounts) => {
          const sum = sumMoney(amounts);
          
          // Verify result is Decimal
          expect(sum).toBeInstanceOf(Decimal);
          
          // Verify precision: sum should equal the sum of all amounts
          const expected = amounts.reduce(
            (acc, amount) => acc.plus(amount),
            new Decimal(0)
          );
          expect(sum.equals(expected)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("Complex calculation chain should maintain precision", () => {
      fc.assert(
        fc.property(
          moneyArbitrary,
          moneyArbitrary,
          moneyArbitrary,
          factorArbitrary,
          (a, b, c, factor) => {
            // Perform a complex calculation: ((a + b) * factor - c) / 2
            const step1 = addMoney(a, b);
            const step2 = multiplyMoney(step1, factor);
            const step3 = subtractMoney(step2, c);
            const result = divideMoney(step3, 2);
            
            // Verify result is Decimal
            expect(result).toBeInstanceOf(Decimal);
            
            // Verify precision by computing the same way
            const expected = new Decimal(a)
              .plus(b)
              .times(factor)
              .minus(c)
              .dividedBy(2);
            
            expect(result.equals(expected)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Associativity: (a + b) + c = a + (b + c)", () => {
      fc.assert(
        fc.property(moneyArbitrary, moneyArbitrary, moneyArbitrary, (a, b, c) => {
          const left = addMoney(addMoney(a, b), c);
          const right = addMoney(a, addMoney(b, c));
          
          // Both should be equal due to precision maintenance
          expect(left.equals(right)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("Commutativity: a + b = b + a", () => {
      fc.assert(
        fc.property(moneyArbitrary, moneyArbitrary, (a, b) => {
          const left = addMoney(a, b);
          const right = addMoney(b, a);
          
          // Both should be equal due to precision maintenance
          expect(left.equals(right)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    test("Distributivity: a * (b + c) = a * b + a * c", () => {
      fc.assert(
        fc.property(
          factorArbitrary,
          moneyArbitrary,
          moneyArbitrary,
          (factor, b, c) => {
            const left = multiplyMoney(addMoney(b, c), factor);
            const right = addMoney(
              multiplyMoney(b, factor),
              multiplyMoney(c, factor)
            );
            
            // Both should be equal due to precision maintenance
            // Use a small epsilon for comparison due to potential rounding in intermediate steps
            const diff = left.minus(right).abs();
            expect(diff.lessThan(0.01)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
