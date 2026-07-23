/**
 * @fileoverview Shared domain types for invest-app calculators.
 * Pure data contracts — no runtime, no DOM. Used by tax/asset/retail modules.
 */

/** Result of progressive NDFL calculation (ст. 214.2 НК РФ). */
export interface TaxResult {
  /** Yearly tax-free allowance: max(maxBalance, 1_000_000) × effectiveRate. */
  yearlyLimit: number;
  /** Total taxable income across all years (after allowance). */
  taxableIncome: number;
  /** Final NDFL amount to pay (progressive 13%/15%). */
  taxAmount: number;
  /** Accumulated tax-free profit used. */
  taxFreeUsed: number;
}

/** Input params for the shared buy-low/sell-high core (currency & metals). */
export interface AssetRoundTripParams {
  /** Initial amount in rubles. */
  amount: number;
  /** Price at which the asset is bought (₽ per unit). */
  buyPrice: number;
  /** Price at which the asset is sold (₽ per unit). */
  sellPrice: number;
  /** Reference CBR price for spread calculation (0 = unknown, spreads → 0). */
  refPrice: number;
  /** CBR key rate (%) for tax-free threshold. */
  keyRate: number;
  /** Holding period in days (for annualized yield). */
  holdPeriod: number;
}

/** Result of the shared buy-low/sell-high core. */
export interface AssetRoundTripResult {
  /** Units of asset bought (amount / buyPrice). */
  units: number;
  /** Rubles received after selling all units. */
  rubAfterSell: number;
  /** Net profit (rubAfterSell - amount), may be negative. */
  profit: number;
  /** Period yield (%): profit / amount × 100. */
  periodYield: number;
  /** Annualized yield (%): periodYield × 365 / holdPeriod. */
  yearlyYield: number;
  /** Buy-side spread: buyPrice - refPrice (positive = overpaid). */
  spreadBuy: number;
  /** Sell-side spread: refPrice - sellPrice (positive = underpaid). */
  spreadSell: number;
  /** totalSpread = spreadBuy + spreadSell. */
  totalSpread: number;
  /** Buy-side margin (%). */
  marginBuy: number;
  /** Sell-side margin (%). */
  marginSell: number;
  /** totalMargin (%). */
  marginTotal: number;
  /** NDFL result for this round-trip. */
  tax: TaxResult;
  /** Final rubles after tax: rubAfterSell - tax.taxAmount. */
  finalAmount: number;
}

/** Retail business metrics (revenue/cost/expenses model). */
export interface RetailMetrics {
  /** profit = revenue - cost - expenses. */
  profit: number;
  /** markup (%) = profit / cost × 100 (0 if cost = 0). */
  markup: number;
  /** margin (%) = profit / revenue × 100 (0 if revenue = 0). */
  margin: number;
  /** ROI (%) = profit / (cost + expenses) × 100 (0 if invested = 0). */
  roi: number;
  /** Annualized yield (%) = ROI × 12 / period. */
  yearlyYield: number;
}

// --- CBR API response contracts (server → client) ---

export interface CbrRateResponse {
  rate: number;
  cached?: boolean;
  stale?: boolean;
}

export interface CbrRatesResponse {
  date: string;
  rates: Record<string, number>;
  cached?: boolean;
  stale?: boolean;
}

export interface CbrMetalPrice {
  Au: number;
  Ag: number;
  Pt: number;
  Pd: number;
}

export interface CbrMetalsResponse {
  date: string;
  metals: CbrMetalPrice;
  cached?: boolean;
  stale?: boolean;
}
