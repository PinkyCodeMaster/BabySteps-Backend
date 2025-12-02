import Decimal from "decimal.js";
import type { debt } from "../db/schema";

/**
 * Snowball Service
 * 
 * Provides pure functions for debt snowball calculations.
 * Implements the debt snowball method where debts are ordered by priority
 * (CCJ by deadline, then non-CCJ by balance) and payments roll over as debts are paid off.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.6
 */

export type DebtRecord = typeof debt.$inferSelect;

export interface DebtPaymentSchedule {
  debts: Array<{
    debtId: string;
    name: string;
    balance: Decimal;
    minimumPayment: Decimal;
    monthlyPayment: Decimal;
    snowballPosition: number;
  }>;
  totalMonthlyPayment: Decimal;
}

export interface MonthlyProjection {
  month: number;
  year: number;
  debts: Array<{
    debtId: string;
    name: string;
    startingBalance: Decimal;
    interestCharged: Decimal;
    paymentApplied: Decimal;
    endingBalance: Decimal;
    isPaidOff: boolean;
  }>;
}

export interface DebtFreeProjection {
  debtFreeDate: Date | null;
  monthsToDebtFree: number | null;
  schedule: MonthlyProjection[];
}

/**
 * Orders debts according to the snowball method:
 * 1. CCJ debts by earliest deadline first
 * 2. Non-CCJ debts by smallest balance first
 * 
 * This is a pure function that does not modify the input array.
 * 
 * @param debts - Array of debt records
 * @returns New array of debts ordered by snowball priority
 * 
 * Requirements: 6.1, 6.2
 * Property 30: CCJ debts prioritized by deadline
 * Property 31: Non-CCJ debts ordered by balance
 */
export function orderDebts(debts: DebtRecord[]): DebtRecord[] {
  // Create a copy to avoid mutating the input
  const debtsCopy = [...debts];

  // Separate CCJ and non-CCJ debts
  const ccjDebts = debtsCopy.filter((d) => d.isCcj);
  const nonCcjDebts = debtsCopy.filter((d) => !d.isCcj);

  // Sort CCJ debts by deadline (earliest first)
  ccjDebts.sort((a, b) => {
    const dateA = a.ccjDeadline ? new Date(a.ccjDeadline).getTime() : Infinity;
    const dateB = b.ccjDeadline ? new Date(b.ccjDeadline).getTime() : Infinity;
    return dateA - dateB;
  });

  // Sort non-CCJ debts by balance (smallest first)
  nonCcjDebts.sort((a, b) => {
    const balanceA = new Decimal(a.balance);
    const balanceB = new Decimal(b.balance);
    return balanceA.comparedTo(balanceB);
  });

  // Combine: CCJ debts first, then non-CCJ debts
  return [...ccjDebts, ...nonCcjDebts];
}

/**
 * Calculates monthly payments for each debt in the snowball.
 * 
 * The focused debt (first in snowball order) receives:
 * - Its minimum payment
 * - All extra available funds (disposableIncome - sum of all minimum payments)
 * 
 * All other debts receive only their minimum payment.
 * 
 * @param debts - Array of debts ordered by snowball priority
 * @param disposableIncome - Total monthly income available for debt payments
 * @returns Payment schedule for each debt
 * 
 * Requirements: 6.4
 * Property 33: Monthly payment calculation
 */
export function calculateMonthlyPayments(
  debts: DebtRecord[],
  disposableIncome: Decimal
): DebtPaymentSchedule {
  if (debts.length === 0) {
    return {
      debts: [],
      totalMonthlyPayment: new Decimal(0),
    };
  }

  // Calculate sum of all minimum payments
  const totalMinimumPayments = debts.reduce(
    (sum, debt) => sum.plus(new Decimal(debt.minimumPayment)),
    new Decimal(0)
  );

  // Calculate extra funds available for the focused debt
  const extraFunds = disposableIncome.minus(totalMinimumPayments);

  // If disposable income is less than minimum payments, we can only pay minimums
  const availableExtra = Decimal.max(extraFunds, new Decimal(0));

  const schedule: DebtPaymentSchedule["debts"] = debts.map((debt, index) => {
    const minimumPayment = new Decimal(debt.minimumPayment);
    const balance = new Decimal(debt.balance);

    // First debt (focused debt) gets minimum + extra funds
    const monthlyPayment =
      index === 0
        ? minimumPayment.plus(availableExtra)
        : minimumPayment;

    return {
      debtId: debt.id,
      name: debt.name,
      balance,
      minimumPayment,
      monthlyPayment,
      snowballPosition: index + 1,
    };
  });

  const totalMonthlyPayment = schedule.reduce(
    (sum, item) => sum.plus(item.monthlyPayment),
    new Decimal(0)
  );

  return {
    debts: schedule,
    totalMonthlyPayment,
  };
}

/**
 * Calculates the rollover amount when a debt is paid off.
 * 
 * When a debt is paid off, its monthly payment amount rolls over to the next debt,
 * increasing the payment on that debt.
 * 
 * @param paidDebt - The debt that was just paid off
 * @param currentPayment - The current monthly payment on the paid debt
 * @param nextDebtMinimum - The minimum payment on the next debt
 * @returns New monthly payment for the next debt (minimum + rollover)
 * 
 * Requirements: 6.3
 * Property 32: Payment rollover on debt payoff
 */
export function calculateRollover(
  currentPayment: Decimal,
  nextDebtMinimum: Decimal
): Decimal {
  return nextDebtMinimum.plus(currentPayment);
}

/**
 * Calculates monthly interest for a debt.
 * 
 * Formula: balance × (interestRate / 100) / 12
 * 
 * @param balance - Current debt balance
 * @param annualInterestRate - Annual interest rate as percentage (e.g., 18.99)
 * @returns Monthly interest amount
 */
export function calculateMonthlyInterest(
  balance: Decimal,
  annualInterestRate: Decimal
): Decimal {
  // Convert percentage to decimal and divide by 12 for monthly rate
  const monthlyRate = annualInterestRate.dividedBy(100).dividedBy(12);
  return balance.times(monthlyRate).toDecimalPlaces(2);
}

/**
 * Projects the debt-free date by simulating monthly payments with interest compounding.
 * 
 * This function:
 * 1. Orders debts by snowball priority
 * 2. Simulates each month:
 *    - Applies interest to all active debts
 *    - Applies payments (focused debt gets extra, others get minimum)
 *    - Marks debts as paid when balance reaches zero
 *    - Rolls over payments to next debt
 * 3. Returns the date when all debts are paid off
 * 
 * @param debts - Array of active debts
 * @param monthlyPayment - Total monthly payment available
 * @returns Projection with debt-free date and monthly schedule
 * 
 * Requirements: 6.6
 * Property 35: Debt-free date projection accuracy
 */
export function projectDebtFreeDate(
  debts: DebtRecord[],
  monthlyPayment: Decimal
): DebtFreeProjection {
  // Handle edge cases
  if (debts.length === 0) {
    return {
      debtFreeDate: new Date(),
      monthsToDebtFree: 0,
      schedule: [],
    };
  }

  // If monthly payment is insufficient to cover minimum payments, cannot project
  const totalMinimumPayments = debts.reduce(
    (sum, debt) => sum.plus(new Decimal(debt.minimumPayment)),
    new Decimal(0)
  );

  if (monthlyPayment.lessThan(totalMinimumPayments)) {
    return {
      debtFreeDate: null,
      monthsToDebtFree: null,
      schedule: [],
    };
  }

  // Order debts by snowball priority
  const orderedDebts = orderDebts(debts);

  // Initialize working state
  interface WorkingDebt {
    debtId: string;
    name: string;
    balance: Decimal;
    interestRate: Decimal;
    minimumPayment: Decimal;
    isPaidOff: boolean;
  }

  let workingDebts: WorkingDebt[] = orderedDebts.map((debt) => ({
    debtId: debt.id,
    name: debt.name,
    balance: new Decimal(debt.balance),
    interestRate: new Decimal(debt.interestRate),
    minimumPayment: new Decimal(debt.minimumPayment),
    isPaidOff: false,
  }));

  const schedule: MonthlyProjection[] = [];
  const today = new Date();
  let currentMonth = today.getMonth() + 1; // 1-12
  let currentYear = today.getFullYear();
  let monthCount = 0;
  const maxMonths = 600; // Safety limit: 50 years

  // Simulate month by month
  while (workingDebts.some((d) => !d.isPaidOff) && monthCount < maxMonths) {
    monthCount++;

    const monthProjection: MonthlyProjection = {
      month: currentMonth,
      year: currentYear,
      debts: [],
    };

    // Step 1: Apply interest to all active debts
    for (const debt of workingDebts) {
      if (!debt.isPaidOff && debt.balance.greaterThan(0)) {
        const interest = calculateMonthlyInterest(debt.balance, debt.interestRate);
        debt.balance = debt.balance.plus(interest);
      }
    }

    // Step 2: Calculate payments for this month
    const activeDebts = workingDebts.filter((d) => !d.isPaidOff);
    const focusedDebtIndex = activeDebts.findIndex((d) => !d.isPaidOff);

    if (focusedDebtIndex === -1) {
      break; // All debts paid
    }

    // Calculate how much extra goes to focused debt
    const activeMinimums = activeDebts.reduce(
      (sum, d) => sum.plus(d.minimumPayment),
      new Decimal(0)
    );
    const extraForFocused = monthlyPayment.minus(activeMinimums);

    // Step 3: Apply payments
    for (let i = 0; i < workingDebts.length; i++) {
      const debt = workingDebts[i]!;
      const startingBalance = debt.balance;

      if (debt.isPaidOff) {
        monthProjection.debts.push({
          debtId: debt.debtId,
          name: debt.name,
          startingBalance,
          interestCharged: new Decimal(0),
          paymentApplied: new Decimal(0),
          endingBalance: new Decimal(0),
          isPaidOff: true,
        });
        continue;
      }

      const interest = calculateMonthlyInterest(
        startingBalance.minus(calculateMonthlyInterest(startingBalance, debt.interestRate)),
        debt.interestRate
      );

      // Determine payment for this debt
      let payment: Decimal;
      if (i === focusedDebtIndex) {
        // Focused debt gets minimum + extra
        payment = debt.minimumPayment.plus(extraForFocused);
      } else {
        // Other debts get minimum only
        payment = debt.minimumPayment;
      }

      // Cap payment at current balance
      payment = Decimal.min(payment, debt.balance);

      // Apply payment
      debt.balance = debt.balance.minus(payment);

      // Check if paid off
      if (debt.balance.lessThanOrEqualTo(0)) {
        debt.balance = new Decimal(0);
        debt.isPaidOff = true;
      }

      monthProjection.debts.push({
        debtId: debt.debtId,
        name: debt.name,
        startingBalance,
        interestCharged: interest,
        paymentApplied: payment,
        endingBalance: debt.balance,
        isPaidOff: debt.isPaidOff,
      });
    }

    schedule.push(monthProjection);

    // Move to next month
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  // Determine debt-free date
  if (workingDebts.every((d) => d.isPaidOff)) {
    const debtFreeDate = new Date(currentYear, currentMonth - 1, 1);
    return {
      debtFreeDate,
      monthsToDebtFree: monthCount,
      schedule,
    };
  }

  // Could not pay off debts within max months
  return {
    debtFreeDate: null,
    monthsToDebtFree: null,
    schedule,
  };
}

/**
 * Snowball Service Class
 * 
 * Provides methods for calculating debt snowball schedules and projections.
 */
export class SnowballService {
  /**
   * Orders debts by snowball priority
   */
  orderDebts(debts: DebtRecord[]): DebtRecord[] {
    return orderDebts(debts);
  }

  /**
   * Calculates monthly payments for debts
   */
  calculateMonthlyPayments(
    debts: DebtRecord[],
    disposableIncome: Decimal
  ): DebtPaymentSchedule {
    return calculateMonthlyPayments(debts, disposableIncome);
  }

  /**
   * Calculates rollover amount
   */
  calculateRollover(currentPayment: Decimal, nextDebtMinimum: Decimal): Decimal {
    return calculateRollover(currentPayment, nextDebtMinimum);
  }

  /**
   * Projects debt-free date
   */
  projectDebtFreeDate(
    debts: DebtRecord[],
    monthlyPayment: Decimal
  ): DebtFreeProjection {
    return projectDebtFreeDate(debts, monthlyPayment);
  }
}

// Export singleton instance
export const snowballService = new SnowballService();
