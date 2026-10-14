/**
 * @fileoverview Дисциплина целевой доходности (§6 методики v4).
 * Портировано из finGuard/useYieldCeiling с исправлением: потолок не зашит
 * константой 15.7%, а ВЫЧИСЛЯЕТСЯ оптимизатором max-yield под текущий стоп.
 * Pure functions — no DOM.
 */

import type { ReframingResult, YieldCeilingResult } from "./advisor-types";
import { ASSET_CLASSES, ASSET_ORDER, optimizeMaxYield } from "./advisor-portfolio";
import { runStressTests } from "./advisor-stress";

/** Плечо по умолчанию: 1.4× портфель, 0.4× долг под ставку фондирования. */
export const DEFAULT_LEVERAGE_RATIO = 1.4;
export const DEFAULT_FUNDING_PERCENT = 13.5;

function weightedYieldGross(allocationShare: ReturnType<typeof optimizeMaxYield>): number {
  let sum = 0;
  for (const id of ASSET_ORDER) sum += ((allocationShare[id] ?? 0) * ASSET_CLASSES[id].yieldGrossPercent) / 100;
  return Number(sum.toFixed(2));
}

/**
 * Честный потолок: доходность портфеля max-yield, проходящего стоп-связку.
 * Плечо: 1.4×15.5% − 0.4×13.5% ≈ 16.3% брутто, но просадка ×1.4 (§6 п.2).
 */
export function analyzeYieldCeiling(
  stopPercent: number,
  requestedYieldPercent: number,
  unleveredWorstStressPercent: number,
): YieldCeilingResult {
  const ceilingAllocation = optimizeMaxYield(stopPercent);
  const honestCeilingGrossPercent = weightedYieldGross(ceilingAllocation);

  const leverageGrossPercent = Number(
    (
      DEFAULT_LEVERAGE_RATIO * honestCeilingGrossPercent
      - (DEFAULT_LEVERAGE_RATIO - 1) * DEFAULT_FUNDING_PERCENT
    ).toFixed(1),
  );
  const leverageWorstStressPercent = Number(
    (unleveredWorstStressPercent * DEFAULT_LEVERAGE_RATIO).toFixed(1),
  );

  return {
    honestCeilingGrossPercent,
    requestedYieldPercent,
    isContradictingStop: requestedYieldPercent > honestCeilingGrossPercent,
    leverageGrossPercent,
    leverageFundingPercent: DEFAULT_FUNDING_PERCENT,
    leverageWorstStressPercent,
  };
}

/** Худшая просадка базового (без плеча) портфеля — вход для плеча. */
export function unleveredWorstStress(
  allocation: ReturnType<typeof optimizeMaxYield>,
  stopPercent: number,
): number {
  const results = runStressTests(allocation, 1, stopPercent);
  return results.reduce((worst, r) => Math.min(worst, r.drawdownPercent), 0);
}

/**
 * Рефрейминг от ставки к сумме (§6 п.4): цель «N млн к горизонту» достигается
 * пополнениями без роста риска. Аннуитет: взнос t растаёт до конца горизонта.
 */
export function analyzeReframing(
  capitalRub: number,
  targetCapitalRub: number,
  netRatePercent: number,
  horizonYears: number,
): ReframingResult {
  const rate = netRatePercent / 100;
  const yieldOnlyCapitalRub = Math.round(
    capitalRub * Math.pow(1 + rate, horizonYears),
  );
  const deficitRub = Math.max(0, targetCapitalRub - yieldOnlyCapitalRub);

  let annuitySum = 0;
  for (let t = 1; t <= horizonYears; t++) {
    annuitySum += Math.pow(1 + rate, horizonYears - t);
  }
  const requiredAnnualContributionRub =
    annuitySum > 0 ? Math.round(deficitRub / annuitySum) : 0;

  return {
    targetCapitalRub,
    yieldOnlyCapitalRub,
    deficitRub: Math.round(deficitRub),
    requiredAnnualContributionRub,
  };
}
