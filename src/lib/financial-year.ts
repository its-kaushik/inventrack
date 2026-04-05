import { CONSTANTS } from '../config/constants.js';

/** Get the short code for the current financial year: e.g., '2627' for FY 2026-27 */
export function getCurrentFYCode(): string {
  const now = new Date();
  const year =
    now.getMonth() >= CONSTANTS.FINANCIAL_YEAR.START_MONTH
      ? now.getFullYear()
      : now.getFullYear() - 1;
  return `${String(year).slice(2)}${String(year + 1).slice(2)}`;
}

/** Get the start and end dates for the current financial year */
export function getCurrentFY(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const year =
    now.getMonth() >= CONSTANTS.FINANCIAL_YEAR.START_MONTH
      ? now.getFullYear()
      : now.getFullYear() - 1;
  return {
    start: new Date(year, 3, 1), // April 1
    end: new Date(year + 1, 2, 31), // March 31
    label: `FY ${year}-${String(year + 1).slice(2)}`,
  };
}
