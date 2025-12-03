import Decimal from 'decimal.js';
import { getDaysInYear, addMonths } from './date';

/**
 * Interest calculation utilities for debt projections.
 * Handles monthly interest calculations and future balance projections with compounding.
 * 
 * Requirements: 12.2, 12.3
 */

/**
 * Calculates monthly interest for a debt.
 * 
 * Formula: balance × (annualInterestRate / 100) / 12
 * 
 * The interest is calculated using the annual percentage rate (APR) divided by 12
 * to get the monthly rate, then applied to the current balance.
 * 
 * @param balance - Current debt balance
 * @param annualInterestRate - Annual interest rate as percentage (e.g., 18.99 for 18.99%)
 * @returns Monthly interest amount rounded to 2 decimal places
 * 
 * Requirements: 12.2
 * Property 57: Interest calculation accuracy
 * 
 * @example
 * // Calculate monthly interest on £1000 at 18% APR
 * const interest = calculateMonthlyInterest(new Decimal(1000), new Decimal(18));
 * // Returns: 15.00 (1000 × 0.18 / 12)
 */
export function calculateMonthlyInterest(
  balance: Decimal,
  annualInterestRate: Decimal
): Decimal {
  // Handle zero or negative balance
  if (balance.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }
  
  // Handle zero interest rate
  if (annualInterestRate.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }
  
  // Convert annual percentage rate to monthly decimal rate
  // APR / 100 converts percentage to decimal (e.g., 18% -> 0.18)
  // / 12 converts annual to monthly rate
  const monthlyRate = annualInterestRate.dividedBy(100).dividedBy(12);
  
  // Calculate interest and round to 2 decimal places
  const interest = balance.times(monthlyRate);
  
  return interest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Projects the future balance of a debt after a specified number of months,
 * accounting for monthly interest compounding and payments.
 * 
 * This function simulates the debt balance month by month:
 * 1. Apply interest to current balance
 * 2. Subtract monthly payment
 * 3. Repeat for specified number of months
 * 
 * Interest compounds monthly, meaning each month's interest is calculated
 * on the balance including previous months' interest.
 * 
 * @param initialBalance - Starting debt balance
 * @param annualInterestRate - Annual interest rate as percentage (e.g., 18.99)
 * @param monthlyPayment - Fixed monthly payment amount
 * @param months - Number of months to project
 * @returns Projected balance after the specified months
 * 
 * Requirements: 12.3
 * Property 58: Future balance projection accuracy
 * 
 * @example
 * // Project balance after 12 months
 * // Starting: £5000, 15% APR, £200/month payment
 * const futureBalance = projectFutureBalance(
 *   new Decimal(5000),
 *   new Decimal(15),
 *   new Decimal(200),
 *   12
 * );
 * // Returns the balance after 12 months of payments with interest
 */
export function projectFutureBalance(
  initialBalance: Decimal,
  annualInterestRate: Decimal,
  monthlyPayment: Decimal,
  months: number
): Decimal {
  // Validate inputs
  if (months < 0) {
    throw new Error('Number of months cannot be negative');
  }
  
  if (months === 0) {
    return initialBalance;
  }
  
  // Handle zero or negative initial balance
  if (initialBalance.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }
  
  let currentBalance = initialBalance;
  
  // Simulate each month
  for (let month = 0; month < months; month++) {
    // Step 1: Apply interest to current balance
    const interest = calculateMonthlyInterest(currentBalance, annualInterestRate);
    currentBalance = currentBalance.plus(interest);
    
    // Step 2: Subtract payment
    currentBalance = currentBalance.minus(monthlyPayment);
    
    // Step 3: Balance cannot go negative (debt is paid off)
    if (currentBalance.lessThanOrEqualTo(0)) {
      return new Decimal(0);
    }
  }
  
  // Round final balance to 2 decimal places
  return currentBalance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Calculates the number of months required to pay off a debt.
 * 
 * This function projects forward month by month until the debt is paid off,
 * accounting for interest compounding.
 * 
 * @param balance - Current debt balance
 * @param annualInterestRate - Annual interest rate as percentage
 * @param monthlyPayment - Fixed monthly payment amount
 * @param maxMonths - Maximum months to project (default: 600 = 50 years)
 * @returns Number of months to pay off debt, or null if cannot be paid off
 * 
 * @example
 * // Calculate months to pay off £5000 at 15% APR with £200/month
 * const months = calculateMonthsToPayoff(
 *   new Decimal(5000),
 *   new Decimal(15),
 *   new Decimal(200)
 * );
 */
export function calculateMonthsToPayoff(
  balance: Decimal,
  annualInterestRate: Decimal,
  monthlyPayment: Decimal,
  maxMonths: number = 600
): number | null {
  // If balance is already zero or negative
  if (balance.lessThanOrEqualTo(0)) {
    return 0;
  }
  
  // Calculate monthly interest to check if payment covers it
  const monthlyInterest = calculateMonthlyInterest(balance, annualInterestRate);
  
  // If payment doesn't cover interest, debt will never be paid off
  if (monthlyPayment.lessThanOrEqualTo(monthlyInterest)) {
    return null;
  }
  
  let currentBalance = balance;
  let months = 0;
  
  while (currentBalance.greaterThan(0) && months < maxMonths) {
    months++;
    
    // Apply interest
    const interest = calculateMonthlyInterest(currentBalance, annualInterestRate);
    currentBalance = currentBalance.plus(interest);
    
    // Apply payment
    currentBalance = currentBalance.minus(monthlyPayment);
  }
  
  // Check if we successfully paid off the debt
  if (currentBalance.lessThanOrEqualTo(0)) {
    return months;
  }
  
  // Could not pay off within max months
  return null;
}

/**
 * Calculates the projected payoff date for a debt.
 * 
 * @param balance - Current debt balance
 * @param annualInterestRate - Annual interest rate as percentage
 * @param monthlyPayment - Fixed monthly payment amount
 * @param startDate - Starting date for projection (defaults to today)
 * @returns Projected payoff date, or null if cannot be paid off
 * 
 * @example
 * // Calculate payoff date for £5000 at 15% APR with £200/month
 * const payoffDate = calculatePayoffDate(
 *   new Decimal(5000),
 *   new Decimal(15),
 *   new Decimal(200)
 * );
 */
export function calculatePayoffDate(
  balance: Decimal,
  annualInterestRate: Decimal,
  monthlyPayment: Decimal,
  startDate: Date = new Date()
): Date | null {
  const months = calculateMonthsToPayoff(balance, annualInterestRate, monthlyPayment);
  
  if (months === null) {
    return null;
  }
  
  // Add months to start date
  return addMonths(startDate, months);
}

/**
 * Calculates daily interest for a debt (useful for exact day calculations).
 * 
 * Formula: balance × (annualInterestRate / 100) / daysInYear
 * 
 * Handles leap years correctly by using the actual number of days in the year.
 * 
 * @param balance - Current debt balance
 * @param annualInterestRate - Annual interest rate as percentage
 * @param date - Date to calculate for (used to determine if leap year)
 * @returns Daily interest amount
 * 
 * Requirements: 12.3
 * 
 * @example
 * // Calculate daily interest on £1000 at 18% APR
 * const dailyInterest = calculateDailyInterest(
 *   new Decimal(1000),
 *   new Decimal(18),
 *   new Date('2024-01-15')
 * );
 * // Returns: 0.49 for leap year (1000 × 0.18 / 366)
 */
export function calculateDailyInterest(
  balance: Decimal,
  annualInterestRate: Decimal,
  date: Date = new Date()
): Decimal {
  // Handle zero or negative balance
  if (balance.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }
  
  // Handle zero interest rate
  if (annualInterestRate.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }
  
  // Get days in year (handles leap years)
  const daysInYear = getDaysInYear(date.getFullYear());
  
  // Convert annual percentage rate to daily decimal rate
  const dailyRate = annualInterestRate.dividedBy(100).dividedBy(daysInYear);
  
  // Calculate interest and round to 2 decimal places
  const interest = balance.times(dailyRate);
  
  return interest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Calculates the total interest that will be paid over the life of a debt.
 * 
 * This function simulates the payoff month by month to accurately calculate
 * the total interest paid, accounting for the fact that the final payment
 * may be less than the regular monthly payment.
 * 
 * @param balance - Current debt balance
 * @param annualInterestRate - Annual interest rate as percentage
 * @param monthlyPayment - Fixed monthly payment amount
 * @returns Total interest paid, or null if debt cannot be paid off
 * 
 * @example
 * // Calculate total interest on £5000 at 15% APR with £200/month
 * const totalInterest = calculateTotalInterest(
 *   new Decimal(5000),
 *   new Decimal(15),
 *   new Decimal(200)
 * );
 */
export function calculateTotalInterest(
  balance: Decimal,
  annualInterestRate: Decimal,
  monthlyPayment: Decimal
): Decimal | null {
  // Check if debt can be paid off
  const monthlyInterest = calculateMonthlyInterest(balance, annualInterestRate);
  if (monthlyPayment.lessThanOrEqualTo(monthlyInterest)) {
    return null;
  }
  
  let currentBalance = balance;
  let totalInterestPaid = new Decimal(0);
  let months = 0;
  const maxMonths = 600;
  
  // Simulate month by month
  while (currentBalance.greaterThan(0) && months < maxMonths) {
    months++;
    
    // Calculate and apply interest
    const interest = calculateMonthlyInterest(currentBalance, annualInterestRate);
    totalInterestPaid = totalInterestPaid.plus(interest);
    currentBalance = currentBalance.plus(interest);
    
    // Apply payment (capped at current balance)
    const payment = Decimal.min(monthlyPayment, currentBalance);
    currentBalance = currentBalance.minus(payment);
  }
  
  if (currentBalance.greaterThan(0)) {
    // Could not pay off within max months
    return null;
  }
  
  return totalInterestPaid.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
