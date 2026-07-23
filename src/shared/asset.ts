/**
 * @fileoverview Shared buy-low/sell-high core (currency & metals).
 * Pure function: AssetRoundTripParams in → AssetRoundTripResult out. No DOM.
 * Logic ported 1:1 from calculateAssetRoundTrip in script.js.
 */

import type { AssetRoundTripParams, AssetRoundTripResult } from "./types";
import { calculateTax } from "./tax";

/**
 * Compute the full round-trip economics for an asset bought then sold.
 * Spreads/margins are zero when refPrice is 0 (CBR price not yet fetched).
 */
export function calculateAssetRoundTrip(
  params: AssetRoundTripParams,
): AssetRoundTripResult {
  const { amount, buyPrice, sellPrice, refPrice, keyRate, holdPeriod } = params;

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

  const tax = calculateTax([Math.max(profit, 0)], amount, keyRate);
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
