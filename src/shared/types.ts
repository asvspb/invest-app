/**
 * @fileoverview Shared domain types for invest-app calculators.
 * Pure data contracts — no runtime, no DOM. Used by tax/asset/retail modules.
 */

/** Result of progressive NDFL calculation (ст. 214.2 НК РФ). */
export interface TaxResult {
  yearlyLimit: number;
  taxableIncome: number;
  taxAmount: number;
  taxFreeUsed: number;
}

/** Property tax result (ст. 217 п.17.1 + ст. 220 НК РФ) for OMS/currency sale. */
export interface PropertyTaxResult {
  /** true if holdPeriod ≥ 3 years (≈1095 days) — income fully exempt. */
  isExempt: boolean;
  /** Holding period in whole+fractional years (holdPeriod / 365). */
  holdingYears: number;
  /** 250 000₽ deduction applied when no purchase docs (0 otherwise). */
  deductionApplied: number;
  /** Taxable property income (≥ 0), after expenses or deduction. */
  taxableIncome: number;
  /** NDFL: 13% up to 2.4M, 15% above (0 if exempt or no base). */
  taxAmount: number;
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
  /** Holding period in days (for annualized yield + 3-year exemption). */
  holdPeriod: number;
  /** Purchase documents available? true → expenses used; false → 250 000₽ deduction. */
  hasPurchaseDocs: boolean;
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
  /** Property NDFL result (ст. 217/220) — OMS & currency are property, not deposits. */
  tax: PropertyTaxResult;
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

/** Retail tax regime (НПД / УСН доходы / УСН доходы−расходы / ОСНО). */
export type RetailTaxRegime = "npd" | "usn-income" | "usn-dr" | "osno";

/** Result of the retail tax calculation (one of NPD / USN / ОСНО regimes). */
export interface RetailTaxResult {
  /** Selected regime (RetailTaxRegime value). */
  regime: string;
  /** Tax base of the regime (revenue for НПД/УСН-доходы, profit for УСН-ДР/ОСНО). */
  taxableIncome: number;
  /** Tax payable for the regime. */
  taxAmount: number;
  /** Effective rate vs revenue (%): tax / revenue × 100 (0 if revenue = 0). */
  effectiveRatePct: number;
  /** Human-readable explanation for the UI. */
  note: string;
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
