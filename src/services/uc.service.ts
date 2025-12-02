import { db } from "../db";
import { ucConfig } from "../db/schema";
import { and, or, isNull, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { AppError, ErrorCodes } from "../middleware/errorHandler.middleware";

/**
 * Universal Credit (UC) Service
 * 
 * Provides pure functions for UC taper calculations and disposable income.
 * UC taper reduces benefits based on income above a work allowance threshold.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

/**
 * UC Configuration interface
 */
export interface UCConfig {
  id: string;
  taperRate: string; // Stored as string (numeric in DB), e.g., "0.55" for 55%
  workAllowance: string; // Stored as string (numeric in DB)
  effectiveFrom: string; // Date string
  effectiveTo: string | null; // Date string or null
  createdAt: Date;
}

/**
 * Calculate UC taper amount based on income and configuration
 * 
 * Pure function that calculates how much Universal Credit is reduced
 * based on income above the work allowance threshold.
 * 
 * Formula: taper = max(0, (income - workAllowance) × taperRate)
 * 
 * Edge case: If income is below or equal to work allowance, taper is zero.
 * 
 * @param grossIncome - Total gross monthly income
 * @param config - UC configuration with taper rate and work allowance
 * @returns UC taper amount as Decimal
 * 
 * Requirements: 7.1, 7.2, 7.5
 * Property 36: UC taper uses configurable parameters
 * Property 37: UC taper calculation formula
 */
export function calculateTaper(
  grossIncome: Decimal,
  config: { taperRate: Decimal; workAllowance: Decimal }
): Decimal {
  // Calculate excess income above work allowance
  const excessIncome = grossIncome.minus(config.workAllowance);

  // If income is below or equal to work allowance, no taper applies
  if (excessIncome.lessThanOrEqualTo(0)) {
    return new Decimal(0);
  }

  // Calculate taper: excess income × taper rate
  const taper = excessIncome.times(config.taperRate);

  return taper;
}

/**
 * Calculate disposable income after expenses and UC taper
 * 
 * Pure function that calculates net disposable income available for
 * debt repayment after accounting for expenses and UC taper.
 * 
 * Formula: disposableIncome = grossIncome - expenses - ucTaper
 * 
 * Note: This can be negative if expenses exceed income.
 * 
 * @param grossIncome - Total gross monthly income
 * @param expenses - Total monthly expenses (excluding UC-paid)
 * @param ucTaper - UC taper amount
 * @returns Disposable income as Decimal (can be negative)
 * 
 * Requirements: 7.3
 * Property 38: Disposable income includes UC taper
 */
export function calculateDisposableIncome(
  grossIncome: Decimal,
  expenses: Decimal,
  ucTaper: Decimal
): Decimal {
  // Disposable income = income - expenses - UC taper
  const disposable = grossIncome.minus(expenses).minus(ucTaper);

  return disposable;
}

/**
 * UC Service class for database operations
 */
export class UCService {
  /**
   * Get the currently active UC configuration
   * 
   * Queries for the UC config where:
   * - effectiveFrom <= today
   * - effectiveTo is NULL OR effectiveTo >= today
   * 
   * @param date - Optional date to check (defaults to today)
   * @returns Active UC configuration
   * @throws {AppError} if no active configuration found
   * 
   * Requirements: 7.1
   */
  async getCurrentConfig(date?: Date): Promise<UCConfig> {
    const checkDate = date || new Date();
    const dateString = checkDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Query for active config
    // effectiveFrom <= checkDate AND (effectiveTo IS NULL OR effectiveTo >= checkDate)
    const configs = await db
      .select()
      .from(ucConfig)
      .where(
        and(
          sql`${ucConfig.effectiveFrom} <= ${dateString}`,
          or(
            isNull(ucConfig.effectiveTo),
            sql`${ucConfig.effectiveTo} >= ${dateString}`
          )
        )
      )
      .limit(1);

    const config = configs[0];

    if (!config) {
      throw new AppError(
        ErrorCodes.RES_NOT_FOUND,
        "No active UC configuration found",
        404
      );
    }

    return config;
  }

  /**
   * Calculate UC taper for an organization
   * 
   * Fetches current UC config and calculates taper based on gross income.
   * 
   * @param grossIncome - Total gross monthly income
   * @param date - Optional date to check config (defaults to today)
   * @returns UC taper amount as Decimal
   * 
   * Requirements: 7.1, 7.2
   */
  async calculateTaperForIncome(
    grossIncome: Decimal,
    date?: Date
  ): Promise<Decimal> {
    const config = await this.getCurrentConfig(date);

    // Convert config values to Decimal
    const taperRate = new Decimal(config.taperRate);
    const workAllowance = new Decimal(config.workAllowance);

    return calculateTaper(grossIncome, { taperRate, workAllowance });
  }

  /**
   * Calculate disposable income for an organization
   * 
   * Calculates net disposable income after expenses and UC taper.
   * UC-paid expenses should be excluded from the expenses parameter.
   * 
   * @param grossIncome - Total gross monthly income
   * @param expenses - Total monthly expenses (excluding UC-paid)
   * @param date - Optional date to check config (defaults to today)
   * @returns Disposable income as Decimal (can be negative)
   * 
   * Requirements: 7.3, 7.4
   * Property 39: UC-paid expenses excluded from disposable income
   */
  async calculateDisposableIncomeForOrg(
    grossIncome: Decimal,
    expenses: Decimal,
    date?: Date
  ): Promise<Decimal> {
    // Calculate UC taper
    const ucTaper = await this.calculateTaperForIncome(grossIncome, date);

    // Calculate disposable income
    return calculateDisposableIncome(grossIncome, expenses, ucTaper);
  }
}

// Export singleton instance
export const ucService = new UCService();
