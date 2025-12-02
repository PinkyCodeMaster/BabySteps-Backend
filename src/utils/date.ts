/**
 * Date utility functions for handling date operations and calculations.
 * Handles leap years correctly for interest calculations and projections.
 * 
 */

/**
 * Checks if a year is a leap year.
 * A year is a leap year if:
 * - It's divisible by 4 AND
 * - Either not divisible by 100 OR divisible by 400
 * 
 * @param year - The year to check
 * @returns True if the year is a leap year
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Gets the number of days in a specific month and year.
 * Handles February correctly for leap years.
 * 
 * @param year - The year
 * @param month - The month (1-12)
 * @returns Number of days in the month
 */
export function getDaysInMonth(year: number, month: number): number {
  // Validate month
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Month must be between 1 and 12.`);
  }
  
  // Days in each month (non-leap year)
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  
  // Adjust February for leap years
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  
  const days = daysInMonth[month - 1];
  if (days === undefined) {
    throw new Error(`Invalid month: ${month}`);
  }
  
  return days;
}

/**
 * Gets the number of days in a year.
 * Returns 366 for leap years, 365 for regular years.
 * 
 * @param year - The year
 * @returns Number of days in the year
 */
export function getDaysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/**
 * Adds a specified number of months to a date.
 * Handles month overflow and day adjustments correctly.
 * 
 * @param date - The starting date
 * @param months - Number of months to add (can be negative)
 * @returns New date with months added
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const currentMonth = result.getMonth();
  const currentDay = result.getDate();
  
  // Add months
  result.setMonth(currentMonth + months);
  
  // Handle day overflow (e.g., Jan 31 + 1 month should be Feb 28/29, not Mar 3)
  if (result.getDate() !== currentDay) {
    // Day overflowed, set to last day of previous month
    result.setDate(0);
  }
  
  return result;
}

/**
 * Adds a specified number of years to a date.
 * Handles leap year transitions correctly.
 * 
 * @param date - The starting date
 * @param years - Number of years to add (can be negative)
 * @returns New date with years added
 */
export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Calculates the number of months between two dates.
 * 
 * @param startDate - The start date
 * @param endDate - The end date
 * @returns Number of months between the dates (can be fractional)
 */
export function monthsBetween(startDate: Date, endDate: Date): number {
  const yearDiff = endDate.getFullYear() - startDate.getFullYear();
  const monthDiff = endDate.getMonth() - startDate.getMonth();
  const dayDiff = endDate.getDate() - startDate.getDate();
  
  // Calculate total months
  let totalMonths = yearDiff * 12 + monthDiff;
  
  // Add fractional month based on days
  if (dayDiff !== 0) {
    const daysInStartMonth = getDaysInMonth(startDate.getFullYear(), startDate.getMonth() + 1);
    totalMonths += dayDiff / daysInStartMonth;
  }
  
  return totalMonths;
}

/**
 * Calculates the number of days between two dates.
 * 
 * @param startDate - The start date
 * @param endDate - The end date
 * @returns Number of days between the dates
 */
export function daysBetween(startDate: Date, endDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

/**
 * Formats a date as YYYY-MM-DD (ISO 8601 date format).
 * 
 * @param date - The date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date as a human-readable string (e.g., "January 2025").
 * 
 * @param date - The date to format
 * @returns Formatted date string
 */
export function formatMonthYear(date: Date): string {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  
  return `${month} ${year}`;
}

/**
 * Parses a date string in YYYY-MM-DD format.
 * 
 * @param dateString - The date string to parse
 * @returns Parsed Date object
 */
export function parseDate(dateString: string): Date {
  const parts = dateString.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD.`);
  }
  
  const yearStr = parts[0];
  const monthStr = parts[1];
  const dayStr = parts[2];
  
  if (!yearStr || !monthStr || !dayStr) {
    throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD.`);
  }
  
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // JavaScript months are 0-indexed
  const day = parseInt(dayStr, 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD.`);
  }
  
  return new Date(year, month, day);
}

/**
 * Gets the first day of the month for a given date.
 * 
 * @param date - The date
 * @returns First day of the month
 */
export function getFirstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Gets the last day of the month for a given date.
 * 
 * @param date - The date
 * @returns Last day of the month
 */
export function getLastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Checks if a date is in the past.
 * 
 * @param date - The date to check
 * @returns True if the date is in the past
 */
export function isPast(date: Date): boolean {
  return date < new Date();
}

/**
 * Checks if a date is in the future.
 * 
 * @param date - The date to check
 * @returns True if the date is in the future
 */
export function isFuture(date: Date): boolean {
  return date > new Date();
}

/**
 * Checks if a date is today.
 * 
 * @param date - The date to check
 * @returns True if the date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
         date.getMonth() === today.getMonth() &&
         date.getDate() === today.getDate();
}

/**
 * Gets the current date with time set to midnight.
 * 
 * @returns Current date at midnight
 */
export function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Clones a date object.
 * 
 * @param date - The date to clone
 * @returns New Date object with the same value
 */
export function cloneDate(date: Date): Date {
  return new Date(date);
}
