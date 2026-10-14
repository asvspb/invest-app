/**
 * @fileoverview Retail tax regime selector (НПД / УСН / ОСНО).
 * Pure function: regime + numbers in → RetailTaxResult out. No DOM.
 *
 * Replaces the removed ст. 214.2 NDFL model for the retail calculator:
 * business income is taxed by the selected regime, not by deposit NDFL.
 */

import { applyProgressiveTax } from "./tax";
import type { RetailTaxResult, RetailTaxRegime } from "./types";

// НПД (самозанятость) — ставка зависит от типа клиента.
const NPD_RATE_INDIVIDUAL = 0.04; // продажа физлицам
const NPD_RATE_BUSINESS = 0.06; // продажа юрлицам/ИП

// УСН «доходы» — фиксированная ставка с выручки.
const USN_INCOME_RATE = 0.06;

// УСН «доходы − расходы».
const USN_DR_RATE = 0.15; // 15% от прибыли
const USN_MIN_RATE = 0.01; // минимальный налог = 1% от выручки (платится всегда)

const PCT_MULTIPLIER = 100;

/** Client type for the НПД regime (rate selector). */
export type NpdClientType = "individual" | "business";

/**
 * Calculate retail tax for the selected regime.
 *
 * - npd:       revenue × rate (4% физлица / 6% юрлица).
 * - usn-income: revenue × 6%.
 * - usn-dr:    max(profit × 15%, revenue × 1%) — мин. налог платится всегда.
 * - osno:      progressive NDFL 13%/15% on max(profit, 0).
 *
 * Loss case: ОСНО/УСН-ДР base clamped to 0; УСН-ДР still pays the 1% min tax.
 * `effectiveRatePct` guards revenue > 0 (no division by zero).
 *
 * Pure: numbers in → typed object out, no DOM.
 */
export function calculateRetailTax(
  regime: RetailTaxRegime,
  revenue: number,
  cost: number,
  expenses: number,
  npdClientType: NpdClientType = "individual",
): RetailTaxResult {
  const profit = revenue - cost - expenses;

  let base: number;
  let tax: number;
  let note: string;

  switch (regime) {
    case "npd": {
      const rate = npdClientType === "business" ? NPD_RATE_BUSINESS : NPD_RATE_INDIVIDUAL;
      base = revenue;
      tax = revenue * rate;
      note = `НПД, ставка ${rate * PCT_MULTIPLIER}%`;
      break;
    }
    case "usn-income": {
      base = revenue;
      tax = revenue * USN_INCOME_RATE;
      note = "УСН доходы 6%";
      break;
    }
    case "usn-dr": {
      base = Math.max(profit, 0);
      const taxByProfit = base * USN_DR_RATE;
      const taxMin = revenue * USN_MIN_RATE;
      tax = Math.max(taxByProfit, taxMin);
      note = taxMin > taxByProfit ? "УСН 15% (мин. налог 1%)" : "УСН доходы−расходы 15%";
      break;
    }
    case "osno": {
      base = Math.max(profit, 0);
      tax = applyProgressiveTax(base);
      note = "ОСНО, НДФЛ 13%/15%";
      break;
    }
  }

  const effectiveRatePct = revenue > 0 ? (tax / revenue) * PCT_MULTIPLIER : 0;

  return { regime, taxableIncome: base, taxAmount: tax, effectiveRatePct, note };
}
