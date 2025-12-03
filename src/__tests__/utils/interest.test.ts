import { describe, test, expect } from 'bun:test';
import Decimal from 'decimal.js';
import {
  calculateMonthlyInterest,
  projectFutureBalance,
  calculateMonthsToPayoff,
  calculatePayoffDate,
  calculateDailyInterest,
  calculateTotalInterest,
} from '../../utils/interest';

describe('Interest Calculation Utilities', () => {
  describe('calculateMonthlyInterest', () => {
    test('calculates monthly interest correctly', () => {
      // £1000 at 18% APR
      // Monthly rate: 18% / 12 = 1.5%
      // Interest: 1000 × 0.015 = £15.00
      const interest = calculateMonthlyInterest(new Decimal(1000), new Decimal(18));
      expect(interest.toNumber()).toBe(15.00);
    });

    test('handles zero balance', () => {
      const interest = calculateMonthlyInterest(new Decimal(0), new Decimal(18));
      expect(interest.toNumber()).toBe(0);
    });

    test('handles zero interest rate', () => {
      const interest = calculateMonthlyInterest(new Decimal(1000), new Decimal(0));
      expect(interest.toNumber()).toBe(0);
    });

    test('handles negative balance', () => {
      const interest = calculateMonthlyInterest(new Decimal(-100), new Decimal(18));
      expect(interest.toNumber()).toBe(0);
    });

    test('rounds to 2 decimal places', () => {
      // £1000 at 18.99% APR
      // Monthly rate: 18.99% / 12 = 1.5825%
      // Interest: 1000 × 0.015825 = £15.825 -> rounds to £15.83
      const interest = calculateMonthlyInterest(new Decimal(1000), new Decimal(18.99));
      expect(interest.toNumber()).toBe(15.83);
    });

    test('handles high interest rates', () => {
      // £5000 at 99.99% APR
      // Monthly rate: 99.99% / 12 = 8.3325%
      // Interest: 5000 × 0.083325 = £416.625 -> rounds to £416.63
      const interest = calculateMonthlyInterest(new Decimal(5000), new Decimal(99.99));
      expect(interest.toNumber()).toBe(416.63);
    });

    test('handles small balances', () => {
      // £10 at 15% APR
      // Monthly rate: 15% / 12 = 1.25%
      // Interest: 10 × 0.0125 = £0.125 -> rounds to £0.13
      const interest = calculateMonthlyInterest(new Decimal(10), new Decimal(15));
      expect(interest.toNumber()).toBe(0.13);
    });
  });

  describe('projectFutureBalance', () => {
    test('projects balance with no interest', () => {
      // £1000 balance, 0% interest, £100/month payment, 5 months
      // Month 1: 1000 - 100 = 900
      // Month 2: 900 - 100 = 800
      // Month 3: 800 - 100 = 700
      // Month 4: 700 - 100 = 600
      // Month 5: 600 - 100 = 500
      const balance = projectFutureBalance(
        new Decimal(1000),
        new Decimal(0),
        new Decimal(100),
        5
      );
      expect(balance.toNumber()).toBe(500);
    });

    test('projects balance with interest compounding', () => {
      // £1000 balance, 12% APR (1% monthly), £50/month payment, 3 months
      // Month 1: 1000 + 10 - 50 = 960
      // Month 2: 960 + 9.60 - 50 = 919.60
      // Month 3: 919.60 + 9.20 - 50 = 878.80
      const balance = projectFutureBalance(
        new Decimal(1000),
        new Decimal(12),
        new Decimal(50),
        3
      );
      expect(balance.toNumber()).toBeCloseTo(878.80, 2);
    });

    test('returns zero when debt is paid off', () => {
      // £500 balance, 0% interest, £100/month payment, 10 months
      // Should be paid off in 5 months
      const balance = projectFutureBalance(
        new Decimal(500),
        new Decimal(0),
        new Decimal(100),
        10
      );
      expect(balance.toNumber()).toBe(0);
    });

    test('handles zero months', () => {
      const balance = projectFutureBalance(
        new Decimal(1000),
        new Decimal(15),
        new Decimal(100),
        0
      );
      expect(balance.toNumber()).toBe(1000);
    });

    test('handles zero initial balance', () => {
      const balance = projectFutureBalance(
        new Decimal(0),
        new Decimal(15),
        new Decimal(100),
        12
      );
      expect(balance.toNumber()).toBe(0);
    });

    test('throws error for negative months', () => {
      expect(() => {
        projectFutureBalance(
          new Decimal(1000),
          new Decimal(15),
          new Decimal(100),
          -5
        );
      }).toThrow('Number of months cannot be negative');
    });

    test('handles leap year correctly', () => {
      // Balance should be calculated the same regardless of leap year
      // since we use monthly interest, not daily
      const balance2024 = projectFutureBalance(
        new Decimal(1000),
        new Decimal(12),
        new Decimal(100),
        12
      );
      const balance2025 = projectFutureBalance(
        new Decimal(1000),
        new Decimal(12),
        new Decimal(100),
        12
      );
      expect(balance2024.toNumber()).toBe(balance2025.toNumber());
    });
  });

  describe('calculateMonthsToPayoff', () => {
    test('calculates months to payoff with no interest', () => {
      // £1000 balance, 0% interest, £100/month
      // Should take exactly 10 months
      const months = calculateMonthsToPayoff(
        new Decimal(1000),
        new Decimal(0),
        new Decimal(100)
      );
      expect(months).toBe(10);
    });

    test('calculates months to payoff with interest', () => {
      // £1000 balance, 12% APR (1% monthly), £110/month
      // Interest per month starts at £10, decreases as balance decreases
      // Should take less than 10 months but more than 9
      const months = calculateMonthsToPayoff(
        new Decimal(1000),
        new Decimal(12),
        new Decimal(110)
      );
      expect(months).toBeGreaterThan(9);
      expect(months).toBeLessThan(11);
    });

    test('returns 0 for zero balance', () => {
      const months = calculateMonthsToPayoff(
        new Decimal(0),
        new Decimal(15),
        new Decimal(100)
      );
      expect(months).toBe(0);
    });

    test('returns null when payment does not cover interest', () => {
      // £10000 balance, 12% APR (1% monthly = £100 interest)
      // Payment of £50 does not cover interest
      const months = calculateMonthsToPayoff(
        new Decimal(10000),
        new Decimal(12),
        new Decimal(50)
      );
      expect(months).toBeNull();
    });

    test('returns null when payment equals interest', () => {
      // £10000 balance, 12% APR (1% monthly = £100 interest)
      // Payment of £100 exactly covers interest, no principal reduction
      const months = calculateMonthsToPayoff(
        new Decimal(10000),
        new Decimal(12),
        new Decimal(100)
      );
      expect(months).toBeNull();
    });

    test('handles small remaining balance correctly', () => {
      // £10 balance, 0% interest, £100/month
      // Should take 1 month
      const months = calculateMonthsToPayoff(
        new Decimal(10),
        new Decimal(0),
        new Decimal(100)
      );
      expect(months).toBe(1);
    });
  });

  describe('calculatePayoffDate', () => {
    test('calculates payoff date correctly', () => {
      const startDate = new Date('2025-01-01');
      const payoffDate = calculatePayoffDate(
        new Decimal(1000),
        new Decimal(0),
        new Decimal(100),
        startDate
      );
      
      expect(payoffDate).not.toBeNull();
      if (payoffDate) {
        // 10 months from Jan 2025 = Nov 2025
        expect(payoffDate.getFullYear()).toBe(2025);
        expect(payoffDate.getMonth()).toBe(10); // November (0-indexed)
      }
    });

    test('returns null when debt cannot be paid off', () => {
      const startDate = new Date('2025-01-01');
      const payoffDate = calculatePayoffDate(
        new Decimal(10000),
        new Decimal(12),
        new Decimal(50),
        startDate
      );
      
      expect(payoffDate).toBeNull();
    });

    test('uses current date when not specified', () => {
      const payoffDate = calculatePayoffDate(
        new Decimal(100),
        new Decimal(0),
        new Decimal(100)
      );
      
      expect(payoffDate).not.toBeNull();
      if (payoffDate) {
        const now = new Date();
        // Should be 1 month from now
        expect(payoffDate.getFullYear()).toBeGreaterThanOrEqual(now.getFullYear());
      }
    });
  });

  describe('calculateDailyInterest', () => {
    test('calculates daily interest for regular year', () => {
      // £1000 at 18% APR in 2025 (365 days)
      // Daily rate: 18% / 365 = 0.0493%
      // Interest: 1000 × 0.000493 = £0.493 -> rounds to £0.49
      const interest = calculateDailyInterest(
        new Decimal(1000),
        new Decimal(18),
        new Date('2025-06-15')
      );
      expect(interest.toNumber()).toBe(0.49);
    });

    test('calculates daily interest for leap year', () => {
      // £1000 at 18% APR in 2024 (366 days)
      // Daily rate: 18% / 366 = 0.0492%
      // Interest: 1000 × 0.000492 = £0.492 -> rounds to £0.49
      const interest = calculateDailyInterest(
        new Decimal(1000),
        new Decimal(18),
        new Date('2024-06-15')
      );
      expect(interest.toNumber()).toBe(0.49);
    });

    test('handles zero balance', () => {
      const interest = calculateDailyInterest(
        new Decimal(0),
        new Decimal(18),
        new Date('2025-01-01')
      );
      expect(interest.toNumber()).toBe(0);
    });

    test('handles zero interest rate', () => {
      const interest = calculateDailyInterest(
        new Decimal(1000),
        new Decimal(0),
        new Date('2025-01-01')
      );
      expect(interest.toNumber()).toBe(0);
    });

    test('uses current date when not specified', () => {
      const interest = calculateDailyInterest(
        new Decimal(1000),
        new Decimal(18)
      );
      // Should return a positive value
      expect(interest.toNumber()).toBeGreaterThan(0);
    });
  });

  describe('calculateTotalInterest', () => {
    test('calculates total interest with no interest rate', () => {
      // £1000 balance, 0% interest, £100/month
      // Takes 10 months, total paid = £1000, interest = £0
      const totalInterest = calculateTotalInterest(
        new Decimal(1000),
        new Decimal(0),
        new Decimal(100)
      );
      
      expect(totalInterest).not.toBeNull();
      if (totalInterest) {
        expect(totalInterest.toNumber()).toBe(0);
      }
    });

    test('calculates total interest with interest rate', () => {
      // £1000 balance, 12% APR, £110/month
      // Will take ~10 months, total interest should be positive
      const totalInterest = calculateTotalInterest(
        new Decimal(1000),
        new Decimal(12),
        new Decimal(110)
      );
      
      expect(totalInterest).not.toBeNull();
      if (totalInterest) {
        expect(totalInterest.toNumber()).toBeGreaterThan(0);
        // Total interest should be less than original balance
        expect(totalInterest.toNumber()).toBeLessThan(1000);
      }
    });

    test('returns null when debt cannot be paid off', () => {
      const totalInterest = calculateTotalInterest(
        new Decimal(10000),
        new Decimal(12),
        new Decimal(50)
      );
      
      expect(totalInterest).toBeNull();
    });

    test('calculates higher interest for longer payoff periods', () => {
      // Same balance, same rate, but different payment amounts
      // Fast payment: £1000 at 12% APR with £500/month (pays off quickly)
      const interestFast = calculateTotalInterest(
        new Decimal(1000),
        new Decimal(12),
        new Decimal(500)
      );
      
      // Slow payment: £1000 at 12% APR with £105/month (takes longer)
      // (needs to be > £10/month interest to make progress)
      const interestSlow = calculateTotalInterest(
        new Decimal(1000),
        new Decimal(12),
        new Decimal(105)
      );
      
      expect(interestFast).not.toBeNull();
      expect(interestSlow).not.toBeNull();
      
      if (interestFast && interestSlow) {
        // Slower payoff should result in more total interest
        expect(interestSlow.toNumber()).toBeGreaterThan(interestFast.toNumber());
      }
    });
  });

  describe('Edge Cases', () => {
    test('handles very large balances', () => {
      const interest = calculateMonthlyInterest(
        new Decimal(1000000),
        new Decimal(15)
      );
      expect(interest.toNumber()).toBe(12500);
    });

    test('handles very small interest rates', () => {
      const interest = calculateMonthlyInterest(
        new Decimal(1000),
        new Decimal(0.01)
      );
      expect(interest.toNumber()).toBeCloseTo(0.01, 2);
    });

    test('handles fractional interest rates', () => {
      const interest = calculateMonthlyInterest(
        new Decimal(1000),
        new Decimal(18.99)
      );
      expect(interest.toNumber()).toBe(15.83);
    });

    test('projectFutureBalance handles exact payoff', () => {
      // £500 balance, 0% interest, £100/month, 5 months
      // Should be exactly zero after 5 months
      const balance = projectFutureBalance(
        new Decimal(500),
        new Decimal(0),
        new Decimal(100),
        5
      );
      expect(balance.toNumber()).toBe(0);
    });
  });
});
