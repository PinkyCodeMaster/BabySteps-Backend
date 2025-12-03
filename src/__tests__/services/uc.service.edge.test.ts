import { describe, test, expect } from "bun:test";
import Decimal from "decimal.js";
import { calculateTaper, calculateDisposableIncome } from "../../services/uc.service";

/**
 * Unit Tests for UC Service Edge Cases
 * 
 * Tests specific edge cases for UC taper calculations:
 * - Income below work allowance (zero taper)
 * - Income exactly equal to work allowance (zero taper)
 * - Income above work allowance (positive taper)
 * - Negative disposable income scenario
 * */

describe("UC Service - Edge Case Unit Tests", () => {
  /**
   * Edge case: Income below work allowance returns zero taper
   * 
   * When a user's income is below the work allowance threshold,
   * no UC taper should be applied (taper = 0).
   * 
   * Requirements: 7.5
   */
  describe("Income below work allowance", () => {
    test("Income £300, work allowance £344 → zero taper", () => {
      const grossIncome = new Decimal(300);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      expect(taper.equals(new Decimal(0))).toBe(true);
      expect(taper.toNumber()).toBe(0);
    });

    test("Income £100, work allowance £344 → zero taper", () => {
      const grossIncome = new Decimal(100);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      expect(taper.equals(new Decimal(0))).toBe(true);
    });

    test("Income £0, work allowance £344 → zero taper", () => {
      const grossIncome = new Decimal(0);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      expect(taper.equals(new Decimal(0))).toBe(true);
    });

    test("Very small income £1, work allowance £344 → zero taper", () => {
      const grossIncome = new Decimal(1);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      expect(taper.equals(new Decimal(0))).toBe(true);
    });

    test("Income just below work allowance £343.99, work allowance £344 → zero taper", () => {
      const grossIncome = new Decimal(343.99);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      expect(taper.equals(new Decimal(0))).toBe(true);
    });
  });

  /**
   * Edge case: Income exactly equal to work allowance returns zero taper
   * 
   * When income exactly equals the work allowance, the taper should be zero
   * because there is no excess income.
   * 
   * Requirements: 7.5
   */
  describe("Income exactly equal to work allowance", () => {
    test("Income £344, work allowance £344 → zero taper", () => {
      const grossIncome = new Decimal(344);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      expect(taper.equals(new Decimal(0))).toBe(true);
      expect(taper.toNumber()).toBe(0);
    });

    test("Income £1000, work allowance £1000 → zero taper", () => {
      const grossIncome = new Decimal(1000);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(1000),
      };

      const taper = calculateTaper(grossIncome, config);

      expect(taper.equals(new Decimal(0))).toBe(true);
    });

    test("Income £500.50, work allowance £500.50 → zero taper", () => {
      const grossIncome = new Decimal(500.50);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(500.50),
      };

      const taper = calculateTaper(grossIncome, config);

      expect(taper.equals(new Decimal(0))).toBe(true);
    });
  });

  /**
   * Edge case: Income above work allowance returns positive taper
   * 
   * When income exceeds the work allowance, taper should be calculated
   * as (income - workAllowance) × taperRate.
   * 
   * Requirements: 7.5
   */
  describe("Income above work allowance", () => {
    test("Income £344.01, work allowance £344 → small positive taper", () => {
      const grossIncome = new Decimal(344.01);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      // (344.01 - 344) × 0.55 = 0.01 × 0.55 = 0.0055
      const expected = new Decimal(0.01).times(0.55);
      expect(taper.equals(expected)).toBe(true);
      expect(taper.toNumber()).toBeCloseTo(0.0055, 4);
    });

    test("Income £500, work allowance £344 → taper £85.80", () => {
      const grossIncome = new Decimal(500);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      // (500 - 344) × 0.55 = 156 × 0.55 = 85.80
      const expected = new Decimal(156).times(0.55);
      expect(taper.equals(expected)).toBe(true);
      expect(taper.toNumber()).toBe(85.80);
    });

    test("Income £1000, work allowance £344 → taper £360.80", () => {
      const grossIncome = new Decimal(1000);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      // (1000 - 344) × 0.55 = 656 × 0.55 = 360.80
      const expected = new Decimal(656).times(0.55);
      expect(taper.equals(expected)).toBe(true);
      expect(taper.toNumber()).toBe(360.80);
    });

    test("Income £2000, work allowance £344, taper rate 55% → taper £910.80", () => {
      const grossIncome = new Decimal(2000);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      // (2000 - 344) × 0.55 = 1656 × 0.55 = 910.80
      expect(taper.toNumber()).toBe(910.80);
    });

    test("Income £3000, work allowance £500, taper rate 63% → taper £1575", () => {
      const grossIncome = new Decimal(3000);
      const config = {
        taperRate: new Decimal(0.63),
        workAllowance: new Decimal(500),
      };

      const taper = calculateTaper(grossIncome, config);

      // (3000 - 500) × 0.63 = 2500 × 0.63 = 1575
      expect(taper.toNumber()).toBe(1575);
    });

    test("Very high income £10000, work allowance £344 → taper £5310.80", () => {
      const grossIncome = new Decimal(10000);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      // (10000 - 344) × 0.55 = 9656 × 0.55 = 5310.80
      const expected = new Decimal(9656).times(0.55);
      expect(taper.equals(expected)).toBe(true);
      expect(taper.toNumber()).toBe(5310.80);
    });
  });

  /**
   * Edge case: Negative disposable income scenario
   * 
   * When expenses and UC taper exceed income, disposable income becomes negative.
   * This indicates the household cannot afford their expenses and debt payments.
   * 
   * Requirements: 7.5
   */
  describe("Negative disposable income", () => {
    test("Income £1000, expenses £800, taper £300 → disposable -£100", () => {
      const grossIncome = new Decimal(1000);
      const expenses = new Decimal(800);
      const ucTaper = new Decimal(300);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      // 1000 - 800 - 300 = -100
      expect(disposable.toNumber()).toBe(-100);
      expect(disposable.lessThan(0)).toBe(true);
    });

    test("Income £1500, expenses £2000, taper £0 → disposable -£500", () => {
      const grossIncome = new Decimal(1500);
      const expenses = new Decimal(2000);
      const ucTaper = new Decimal(0);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      // 1500 - 2000 - 0 = -500
      expect(disposable.toNumber()).toBe(-500);
      expect(disposable.lessThan(0)).toBe(true);
    });

    test("Income £2000, expenses £1500, taper £910.80 → disposable -£410.80", () => {
      const grossIncome = new Decimal(2000);
      const expenses = new Decimal(1500);
      const ucTaper = new Decimal(910.80);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      // 2000 - 1500 - 910.80 = -410.80
      expect(disposable.toFixed(2)).toBe("-410.80");
      expect(disposable.lessThan(0)).toBe(true);
    });

    test("Income £500, expenses £400, taper £200 → disposable -£100", () => {
      const grossIncome = new Decimal(500);
      const expenses = new Decimal(400);
      const ucTaper = new Decimal(200);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      // 500 - 400 - 200 = -100
      expect(disposable.toNumber()).toBe(-100);
      expect(disposable.lessThan(0)).toBe(true);
    });

    test("Very negative: Income £1000, expenses £5000, taper £500 → disposable -£4500", () => {
      const grossIncome = new Decimal(1000);
      const expenses = new Decimal(5000);
      const ucTaper = new Decimal(500);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      // 1000 - 5000 - 500 = -4500
      expect(disposable.toNumber()).toBe(-4500);
      expect(disposable.lessThan(0)).toBe(true);
    });

    test("Barely negative: Income £1000, expenses £999, taper £1.50 → disposable -£0.50", () => {
      const grossIncome = new Decimal(1000);
      const expenses = new Decimal(999);
      const ucTaper = new Decimal(1.50);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      // 1000 - 999 - 1.50 = -0.50
      expect(disposable.toFixed(2)).toBe("-0.50");
      expect(disposable.lessThan(0)).toBe(true);
    });
  });

  /**
   * Additional edge cases for completeness
   */
  describe("Additional edge cases", () => {
    test("Zero expenses and zero taper → disposable equals income", () => {
      const grossIncome = new Decimal(2000);
      const expenses = new Decimal(0);
      const ucTaper = new Decimal(0);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      expect(disposable.equals(grossIncome)).toBe(true);
      expect(disposable.toNumber()).toBe(2000);
    });

    test("Zero income, zero expenses, zero taper → disposable is zero", () => {
      const grossIncome = new Decimal(0);
      const expenses = new Decimal(0);
      const ucTaper = new Decimal(0);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      expect(disposable.equals(new Decimal(0))).toBe(true);
    });

    test("Taper rate of 0% means no taper regardless of income", () => {
      const grossIncome = new Decimal(5000);
      const config = {
        taperRate: new Decimal(0),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      expect(taper.equals(new Decimal(0))).toBe(true);
    });

    test("Taper rate of 100% means all excess income is tapered", () => {
      const grossIncome = new Decimal(1000);
      const config = {
        taperRate: new Decimal(1.0),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);

      // (1000 - 344) × 1.0 = 656
      const excessIncome = grossIncome.minus(config.workAllowance);
      expect(taper.equals(excessIncome)).toBe(true);
      expect(taper.toNumber()).toBe(656);
    });

    test("Work allowance of £0 means all income is subject to taper", () => {
      const grossIncome = new Decimal(1000);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(0),
      };

      const taper = calculateTaper(grossIncome, config);

      // (1000 - 0) × 0.55 = 550
      expect(taper.toNumber()).toBe(550);
    });

    test("Very high work allowance means most income is not tapered", () => {
      const grossIncome = new Decimal(2000);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(10000),
      };

      const taper = calculateTaper(grossIncome, config);

      // Income is below work allowance, so no taper
      expect(taper.equals(new Decimal(0))).toBe(true);
    });

    test("Precision is maintained with decimal amounts", () => {
      const grossIncome = new Decimal(1234.56);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344.78),
      };

      const taper = calculateTaper(grossIncome, config);

      // (1234.56 - 344.78) × 0.55 = 889.78 × 0.55 = 489.379
      const expected = new Decimal(1234.56).minus(344.78).times(0.55);
      expect(taper.equals(expected)).toBe(true);
      expect(taper.toFixed(2)).toBe("489.38"); // Rounded to 2 decimal places
    });

    test("Disposable income with all positive values", () => {
      const grossIncome = new Decimal(3000);
      const expenses = new Decimal(1000);
      const ucTaper = new Decimal(500);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      // 3000 - 1000 - 500 = 1500
      expect(disposable.toNumber()).toBe(1500);
      expect(disposable.greaterThan(0)).toBe(true);
    });

    test("Disposable income exactly zero", () => {
      const grossIncome = new Decimal(1000);
      const expenses = new Decimal(600);
      const ucTaper = new Decimal(400);

      const disposable = calculateDisposableIncome(grossIncome, expenses, ucTaper);

      // 1000 - 600 - 400 = 0
      expect(disposable.equals(new Decimal(0))).toBe(true);
      expect(disposable.toNumber()).toBe(0);
    });
  });

  /**
   * Real-world scenario tests
   */
  describe("Real-world scenarios", () => {
    test("Scenario 1: Low income family below work allowance", () => {
      // Family earning £300/month (below work allowance)
      const grossIncome = new Decimal(300);
      const expenses = new Decimal(250);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);
      const disposable = calculateDisposableIncome(grossIncome, expenses, taper);

      // No taper applied
      expect(taper.toNumber()).toBe(0);
      // Disposable = 300 - 250 - 0 = 50
      expect(disposable.toNumber()).toBe(50);
    });

    test("Scenario 2: Family just above work allowance", () => {
      // Family earning £500/month (above work allowance)
      const grossIncome = new Decimal(500);
      const expenses = new Decimal(350);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);
      const disposable = calculateDisposableIncome(grossIncome, expenses, taper);

      // Taper = (500 - 344) × 0.55 = 85.80
      expect(taper.toNumber()).toBe(85.80);
      // Disposable = 500 - 350 - 85.80 = 64.20
      expect(disposable.toFixed(2)).toBe("64.20");
    });

    test("Scenario 3: Family with high income and expenses", () => {
      // Family earning £2500/month with high expenses
      const grossIncome = new Decimal(2500);
      const expenses = new Decimal(1800);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);
      const disposable = calculateDisposableIncome(grossIncome, expenses, taper);

      // Taper = (2500 - 344) × 0.55 = 1185.80
      expect(taper.toFixed(2)).toBe("1185.80");
      // Disposable = 2500 - 1800 - 1185.80 = -485.80 (negative!)
      expect(disposable.toFixed(2)).toBe("-485.80");
      expect(disposable.lessThan(0)).toBe(true);
    });

    test("Scenario 4: Family with moderate income and low expenses", () => {
      // Family earning £1500/month with low expenses
      const grossIncome = new Decimal(1500);
      const expenses = new Decimal(600);
      const config = {
        taperRate: new Decimal(0.55),
        workAllowance: new Decimal(344),
      };

      const taper = calculateTaper(grossIncome, config);
      const disposable = calculateDisposableIncome(grossIncome, expenses, taper);

      // Taper = (1500 - 344) × 0.55 = 635.80
      expect(taper.toFixed(2)).toBe("635.80");
      // Disposable = 1500 - 600 - 635.80 = 264.20
      expect(disposable.toFixed(2)).toBe("264.20");
      expect(disposable.greaterThan(0)).toBe(true);
    });
  });
});
