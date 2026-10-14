/**
 * @fileoverview Канонические стресс-сценарии (§9) и стоп-связка (§7) методики v4.
 * Портировано из finGuard/stress.constants + useStressTesting с исправлением:
 * величина обрезки акций считается по чувствительности БАЙНЯЩЕГО сценария
 * (у finGuard был жёсткий коэффициент 0.4 от сценария «акции −40%»).
 * Pure functions — no DOM.
 */

import type {
  Allocation,
  AssetClassId,
  StressScenario,
  StressScenarioResult,
  StopBinding,
} from "./advisor-types";

/** Буфер стоп-связки: худшая просадка ≤ |стоп| − 2 п.п. (§7). */
export const STOP_BUFFER_PERCENT = 2.0;

/** Чувствительность по умолчанию: 1 п.п. акций ↔ ОФЗ ≈ 0.4 п.п. просадки. */
const DEFAULT_EQUITY_SENSITIVITY = 0.4;

/** Канонические сценарии §9; impacts = изменение цены класса, %. */
export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "rate_plus_200",
    titleRu: "Ставка +200 б.п.",
    descRu: "Удар по длинным ОФЗ и корпоратам (дюрация × 2%)",
    impacts: {
      money_market: 0.2,
      ofz_pd_ladder: -7.6,
      corporate_bonds: -4.4,
      replacement_bonds: -1.0,
      gold: -2.0,
      index_equities: -6.0,
      bank_deposits: 0,
    },
  },
  {
    id: "rate_minus_300",
    titleRu: "Ставка −300 б.п.",
    descRu: "Риск реинвестирования: тело ОФЗ растёт, новые деньги — под низкую ставку",
    impacts: {
      money_market: -1.5,
      ofz_pd_ladder: 11.4,
      corporate_bonds: 6.6,
      replacement_bonds: 2.0,
      gold: 4.0,
      index_equities: 12.0,
      bank_deposits: 0,
    },
  },
  {
    id: "equities_minus_40",
    titleRu: "Акции −40%",
    descRu: "Нормальная история для IMOEX; бегство в качество",
    impacts: {
      money_market: 0,
      ofz_pd_ladder: 1.5,
      corporate_bonds: -1.0,
      replacement_bonds: 2.0,
      gold: 5.0,
      index_equities: -40.0,
      bank_deposits: 0,
    },
  },
  {
    id: "correlation_crisis",
    titleRu: "Корреляционный кризис",
    descRu: "Все классы вниз одновременно, золото не спасает",
    impacts: {
      money_market: -0.5,
      ofz_pd_ladder: -6.0,
      corporate_bonds: -7.5,
      replacement_bonds: -4.0,
      gold: -6.0,
      index_equities: -28.0,
      bank_deposits: 0,
    },
  },
  {
    id: "infrastructure_shock",
    titleRu: "Инфраструктурный шок",
    descRu: "Остановка торгов, заморозка потоков, трение конвертации",
    impacts: {
      money_market: 0,
      ofz_pd_ladder: -3.0,
      corporate_bonds: -5.0,
      replacement_bonds: -9.0,
      gold: -4.0,
      index_equities: -15.0,
      bank_deposits: 0,
    },
  },
  {
    id: "bank_run_dia",
    titleRu: "Отзыв лицензии банка",
    descRu: "Потеря суммы сверх лимита АСВ по вкладам",
    impacts: {
      money_market: 0,
      ofz_pd_ladder: 0,
      corporate_bonds: -2.0,
      replacement_bonds: 0,
      gold: 0,
      index_equities: 0,
      bank_deposits: -25.0,
    },
  },
];

const ASSET_IDS: AssetClassId[] = [
  "money_market",
  "ofz_pd_ladder",
  "corporate_bonds",
  "replacement_bonds",
  "gold",
  "index_equities",
  "bank_deposits",
];

/** Просадка портфеля по каждому сценарию + флаг нарушения стопа. */
export function runStressTests(
  allocation: Allocation,
  capitalRub: number,
  stopPercent: number,
): StressScenarioResult[] {
  return STRESS_SCENARIOS.map((scenario) => {
    let drawdown = 0;
    for (const id of ASSET_IDS) {
      drawdown += ((allocation[id] ?? 0) * scenario.impacts[id]) / 100;
    }
    const drawdownPercent = Number(drawdown.toFixed(2));
    const drawdownRub = Math.round((capitalRub * drawdownPercent) / 100);
    return {
      scenario,
      drawdownPercent,
      drawdownRub,
      postCrisisCapitalRub: capitalRub + drawdownRub,
      violatesStop: drawdownPercent < stopPercent,
    };
  });
}

/**
 * Стоп-связка §7: худшая просадка ≤ |стоп| − буфер.
 * Чувствительность обрезки: перенос 1 п.п. из акций в ОФЗ меняет просадку
 * байнящего сценария на |impact(акции) − impact(ОФЗ)| п.п.
 */
export function evaluateStopBinding(
  results: StressScenarioResult[],
  allocation: Allocation,
  stopPercent: number,
): StopBinding {
  const worst = results.reduce((a, b) => (b.drawdownPercent < a.drawdownPercent ? b : a));

  const absThreshold = Math.max(0, Math.abs(stopPercent) - STOP_BUFFER_PERCENT);
  const effectiveThresholdPercent = -absThreshold;

  const excess = worst.drawdownPercent < effectiveThresholdPercent
    ? Number((effectiveThresholdPercent - worst.drawdownPercent).toFixed(2))
    : 0;

  const sensitivity = Math.abs(
    worst.scenario.impacts.index_equities - worst.scenario.impacts.ofz_pd_ladder,
  );
  const perPoint = sensitivity > 0 ? sensitivity : DEFAULT_EQUITY_SENSITIVITY;

  const equityNow = allocation.index_equities;
  const cutPoints = excess > 0 ? Math.ceil(excess / perPoint) : 0;
  const recommendedEquityShare = Math.max(0, equityNow - cutPoints);

  const verdictRu = excess === 0
    ? `Стресс-связка ВЫПОЛНЯЕТСЯ: худшая просадка ${worst.drawdownPercent}% `
      + `≤ порога ${effectiveThresholdPercent}% (стоп ${stopPercent}% − буфер 2 п.п.)`
    : `Стресс-связка НЕ ВЫПОЛНЯЕТСЯ: ${worst.drawdownPercent}% > ${effectiveThresholdPercent}%. `
      + `Резать акции: ${equityNow}% → ${recommendedEquityShare}% `
      + `(сценарий «${worst.scenario.titleRu}», ${perPoint.toFixed(2)} п.п./%)`;

  return {
    worstDrawdownPercent: worst.drawdownPercent,
    worstScenarioTitleRu: worst.scenario.titleRu,
    effectiveThresholdPercent,
    passes: excess === 0,
    excessPercent: excess,
    recommendedEquityShare,
    verdictRu,
  };
}
