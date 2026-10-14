/**
 * @fileoverview Shared buy-low/sell-high core (currency & metals).
 * Pure function: AssetRoundTripParams in → AssetRoundTripResult out. No DOM.
 * Logic ported 1:1 from calculateAssetRoundTrip in script.js.
 */

import type { AssetRoundTripParams, AssetRoundTripResult, PropertyTaxResult } from "./types";
import { applyProgressiveTax } from "./tax";

// Property tax constants — ст. 217 п.17.1 (3-year exemption) + ст. 220 (deduction/expenses).
const HOLD_EXEMPT_DAYS = 365 * 3;
const DAYS_PER_YEAR = 365;
const PROPERTY_DEDUCTION = 250_000;

/**
 * Compute property NDFL for selling OMS / currency (ст. 217 п.17.1 + ст. 220 НК РФ).
 *
 * - holdPeriod ≥ 3 years → income fully exempt (0 tax).
 * - < 3 years, hasPurchaseDocs → base = max(rubAfterSell - purchaseCost, 0).
 * - < 3 years, no docs          → base = max(rubAfterSell - 250 000, 0).
 *
 * Then 13% up to 2.4M, 15% above. The 250 000₽ deduction applies to GROSS sale
 * proceeds (ст. 220), not to profit — that is the critical rule.
 *
 * Pure: object in → typed object out, no DOM.
 */
export function calculatePropertyTax(
  rubAfterSell: number,
  purchaseCost: number,
  hasPurchaseDocs: boolean,
  holdPeriod: number,
): PropertyTaxResult {
  const holdingYears = holdPeriod / DAYS_PER_YEAR;
  const isExempt = holdPeriod >= HOLD_EXEMPT_DAYS;
  if (isExempt) {
    return { isExempt: true, holdingYears, deductionApplied: 0, taxableIncome: 0, taxAmount: 0 };
  }

  let base: number;
  let deductionApplied: number;
  if (hasPurchaseDocs) {
    base = Math.max(rubAfterSell - purchaseCost, 0);
    deductionApplied = 0;
  } else {
    deductionApplied = PROPERTY_DEDUCTION;
    base = Math.max(rubAfterSell - PROPERTY_DEDUCTION, 0);
  }

  return {
    isExempt: false,
    holdingYears,
    deductionApplied,
    taxableIncome: base,
    taxAmount: applyProgressiveTax(base),
  };
}

/**
 * Compute the full round-trip economics for an asset bought then sold.
 * Spreads/margins are zero when refPrice is 0 (CBR price not yet fetched).
 * `profit` (currency-exchange gain) is shown for yield, but NOT taxed — it is
 * not property income in the way the law taxes it; the property tax below is
 * computed on sale proceeds vs cost, per ст. 220.
 */
export function calculateAssetRoundTrip(
  params: AssetRoundTripParams,
): AssetRoundTripResult {
  const { amount, buyPrice, sellPrice, refPrice, holdPeriod, hasPurchaseDocs } = params;

  const units = amount / buyPrice;
  const rubAfterSell = units * sellPrice;
  const profit = rubAfterSell - amount;

  const spreadBuy = refPrice > 0 ? buyPrice - refPrice : 0;
  const spreadSell = refPrice > 0 ? refPrice - sellPrice : 0;
  const totalSpread = spreadBuy + spreadSell;
  const marginBuy = refPrice > 0 ? (spreadBuy / refPrice) * 100 : 0;
  const marginSell = refPrice > 0 ? (spreadSell / refPrice) * 100 : 0;
  const marginTotal = refPrice > 0 ? (totalSpread / refPrice) * 100 : 0;

  const periodYield = (profit / amount) * 100;
  const yearlyYield = periodYield * (365 / holdPeriod);

  const tax = calculatePropertyTax(rubAfterSell, amount, hasPurchaseDocs, holdPeriod);
  const finalAmount = rubAfterSell - tax.taxAmount;

  return {
    units,
    rubAfterSell,
    profit,
    periodYield,
    yearlyYield,
    spreadBuy,
    spreadSell,
    totalSpread,
    marginBuy,
    marginSell,
    marginTotal,
    tax,
    finalAmount,
  };
}
