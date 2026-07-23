/**
 * @fileoverview NDFL (НДФЛ) calculation — progressive rates, ст. 214.2 НК РФ.
 * Pure function: numbers in → TaxResult out. No DOM. Logic ported 1:1 from script.js.
 */

import type { TaxResult } from "./types";

// Named constants (AGENTS.md §6.4 — no magic numbers).
const TAX_FREE_MAX = 1_000_000;
const MIN_CBR_RATE = 0.13;
const THRESHOLD_13_PCT = 5_000_000;
const RATE_13 = 0.13;
const RATE_15 = 0.15;

/**
 * Calculate progressive NDFL across multiple years of profit.
 *
 * @param profitByYear - yearly profits (may contain negatives; caller is expected
 *   to pass Math.max(profit, 0) for loss protection where applicable).
 * @param maxBalance   - max account balance (or invested capital) for tax-free base.
 * @param cbrRate      - CBR key rate (%); floored at MIN_CBR_RATE (13%).
 */
export function calculateTax(
  profitByYear: number[],
  maxBalance: number,
  cbrRate: number,
): TaxResult {
  const effectiveRate = Math.max(cbrRate, MIN_CBR_RATE) / 100;
  const taxFreeBase = Math.max(maxBalance, TAX_FREE_MAX);
  const yearlyTaxFree = taxFreeBase * effectiveRate;

  let totalTax = 0;
  let totalTaxable = 0;
  let totalTaxFreeUsed = 0;

  for (const yearProfit of profitByYear) {
    if (yearProfit <= yearlyTaxFree) {
      totalTaxFreeUsed += yearProfit;
      continue;
    }

    const taxableForYear = yearProfit - yearlyTaxFree;
    totalTaxable += taxableForYear;
    totalTaxFreeUsed += yearlyTaxFree;

    if (totalTaxable <= THRESHOLD_13_PCT) {
      totalTax += taxableForYear * RATE_13;
    } else {
      const remainingAt13 = Math.max(THRESHOLD_13_PCT - (totalTaxable - taxableForYear), 0);
      totalTax += remainingAt13 * RATE_13 + Math.max(taxableForYear - remainingAt13, 0) * RATE_15;
    }
  }

  return {
    yearlyLimit: yearlyTaxFree,
    taxableIncome: totalTaxable,
    taxAmount: totalTax,
    taxFreeUsed: totalTaxFreeUsed,
  };
}
