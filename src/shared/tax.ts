/**
 * @fileoverview NDFL (НДФЛ) calculation — progressive rates, ст. 214.2 НК РФ.
 * Pure function: numbers in → TaxResult out. No DOM.
 *
 * Phase A (2026-07): THRESHOLD_13_PCT = 2.4M, no 13% floor on CBR rate,
 * tax-free base = 1_000_000 × CBR rate (ignores maxBalance), threshold
 * applied per year (not cumulative).
 */

import type { TaxResult } from "./types";

const TAX_FREE_MAX = 1_000_000;

// Shared progressive-rate constants — reused by property tax (ст. 220) & retail.
// 13% up to 2.4M, 15% above — same bracket for deposits (ст. 214.2) and property.
export const TAX_BRACKET_THRESHOLD = 2_400_000;
export const TAX_RATE_13 = 0.13;
export const TAX_RATE_15 = 0.15;

/**
 * Apply progressive NDFL brackets (13% up to 2.4M, 15% above) to a tax base.
 * Shared by deposits (ст. 214.2), property (ст. 217/220) and retail ОСНО.
 * Returns 0 for non-positive base (loss / no income).
 */
export function applyProgressiveTax(base: number): number {
  if (base <= 0) return 0;
  if (base <= TAX_BRACKET_THRESHOLD) return base * TAX_RATE_13;
  return TAX_BRACKET_THRESHOLD * TAX_RATE_13 + (base - TAX_BRACKET_THRESHOLD) * TAX_RATE_15;
}

/**
 * Calculate progressive NDFL across multiple years of profit.
 *
 * @param profitByYear - yearly profits (caller Math.max(profit, 0) for losses).
 * @param _maxBalance  - unused (Phase A: always uses 1_000_000 × cbrRate).
 * @param cbrRate      - CBR key rate (%), no floor applied.
 */
export function calculateTax(
  profitByYear: number[],
  _maxBalance: number,
  cbrRate: number,
): TaxResult {
  const effectiveRate = cbrRate / 100;
  const yearlyTaxFree = TAX_FREE_MAX * effectiveRate;

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

    totalTax += applyProgressiveTax(taxableForYear);
  }

  return {
    yearlyLimit: yearlyTaxFree,
    taxableIncome: totalTaxable,
    taxAmount: totalTax,
    taxFreeUsed: totalTaxFreeUsed,
  };
}
