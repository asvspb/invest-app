/**
 * @fileoverview Модель портфеля советника (§11, §13 методики v4).
 * Портировано из finGuard/portfolio.constants + оптимизаторы + autoBalance.
 * Исправления против finGuard:
 *  - ФДМ 18.5% → 14.0% (следует за ключевой ставкой 14%, срез 2026-10);
 *  - min-risk: вклады 10% → 5% (в пределах АСВ при капитале 25 млн);
 *  - optimizeMaxYield ищет долю акций через стресс-движок, а не магическую формулу.
 * Pure functions — no DOM.
 */

import type {
  Allocation,
  AssetClassDef,
  AssetClassId,
  AuditResult,
  PortfolioSummary,
} from "./advisor-types";
import { runStressTests, evaluateStopBinding } from "./advisor-stress";

/** Цепочка приоритетов §1 — для баннера таба. */
export const PRIORITY_CHAIN_RU =
  "легальность → обязательства → ликвидность → цель → риск → налоги → доходность";

/** Обязательный дисклеймер §18. */
export const ADVISOR_DISCLAIMER_RU =
  "Материал носит информационно-аналитический характер и не является индивидуальной "
  + "инвестиционной рекомендацией. Доходность не гарантирована, возможна потеря капитала. "
  + "Налоговые правила могут измениться — проверьте применимость на дату сделки у брокера "
  + "и налогового консультанта.";

export const ASSET_ORDER: AssetClassId[] = [
  "money_market",
  "ofz_pd_ladder",
  "corporate_bonds",
  "replacement_bonds",
  "gold",
  "index_equities",
  "bank_deposits",
];

/**
 * Доходности — [модель, срез 2026-10]: ключевая 14.0% (cbr.ru, с 27.07.2026),
 * кривая ОФЗ 3–5 лет ~15.2%, топ-вклады APR ~14.1% (banki.ru, 13.10.2026).
 */
export const ASSET_CLASSES: Record<AssetClassId, AssetClassDef> = {
  money_market: {
    id: "money_market",
    nameRu: "Фонды денежного рынка",
    roleRu: "Резерв 3–6 мес. расходов; не ядро (нет АСВ, НДФЛ ежегодно)",
    yieldGrossPercent: 14.0,
    durationYears: 0.1,
    stateExposureRatio: 0.8,
    instrumentsRu: "LQDT, SBMM",
    sourceTag: "провайдер",
  },
  ofz_pd_ladder: {
    id: "ofz_pd_ladder",
    nameRu: "ОФЗ-ПД, лестница 2029–2031",
    roleRu: "Ядро: фиксация доходности на горизонте",
    yieldGrossPercent: 15.2,
    durationYears: 3.8,
    stateExposureRatio: 1.0,
    instrumentsRu: "ОФЗ 26242 (2029), 26238 (2031)",
    sourceTag: "факт",
  },
  corporate_bonds: {
    id: "corporate_bonds",
    nameRu: "Корпораты AAA–AA ≤3 лет",
    roleRu: "Премия 100–200 б.п. к ОФЗ без ВДО",
    yieldGrossPercent: 16.8,
    durationYears: 2.2,
    stateExposureRatio: 0.65,
    instrumentsRu: "РЖД, ВЭБ.РФ, ДОМ.РФ",
    sourceTag: "провайдер",
  },
  replacement_bonds: {
    id: "replacement_bonds",
    nameRu: "Замещающие облигации (USD)",
    roleRu: "Валютная экспозиция в рублёвом контуре",
    yieldGrossPercent: 8.5,
    durationYears: 3.0,
    stateExposureRatio: 0.7,
    instrumentsRu: "Газпром Капитал ЗО28, Новатэк ЗО26",
    sourceTag: "провайдер",
  },
  gold: {
    id: "gold",
    nameRu: "Золото",
    roleRu: "Диверсификатор; биржевые инструменты дают ЛДВ",
    yieldGrossPercent: 11.0,
    durationYears: 0,
    stateExposureRatio: 0.0,
    instrumentsRu: "Селигдар GOLD01; GLDRUB_TOM (без ЛДВ)",
    sourceTag: "модель",
  },
  index_equities: {
    id: "index_equities",
    nameRu: "Акции — индексные фонды",
    roleRu: "Рост + дивиденды; отдельные бумаги — нет",
    yieldGrossPercent: 16.5,
    durationYears: 0,
    stateExposureRatio: 0.4,
    instrumentsRu: "TMOS + EQMX (равновзвешенный)",
    sourceTag: "модель",
  },
  bank_deposits: {
    id: "bank_deposits",
    nameRu: "Вклады (до лимита АСВ)",
    roleRu: "Резерв/тактика ≤ АСВ; ловушки — §12",
    yieldGrossPercent: 14.1,
    durationYears: 1.0,
    stateExposureRatio: 0.5,
    instrumentsRu: "Топ-APR banki.ru",
    sourceTag: "провайдер",
  },
};

/** Согласованный план «v2» (сессия 13.10.2026). */
export const PLAN_V2_SHARES: Allocation = {
  money_market: 6,
  ofz_pd_ladder: 40,
  corporate_bonds: 15,
  replacement_bonds: 15,
  gold: 9,
  index_equities: 15,
  bank_deposits: 0,
};

/** Осторожный план: 10% акции / 45% ОФЗ. */
export const PLAN_CAUTIOUS_SHARES: Allocation = {
  ...PLAN_V2_SHARES,
  ofz_pd_ladder: 45,
  index_equities: 10,
};

const YIELD_MIN = 8.0;
const YIELD_MAX = 17.5;

/** Сводка портфеля: средневзвешенные метрики + проекции (§8.2 — [модель]). */
export function calcPortfolioSummary(
  allocation: Allocation,
  capitalRub: number,
): PortfolioSummary {
  let totalPercent = 0;
  let yieldSum = 0;
  let durationSum = 0;
  let stateSum = 0;

  for (const id of ASSET_ORDER) {
    const share = allocation[id] ?? 0;
    const def = ASSET_CLASSES[id];
    totalPercent += share;
    yieldSum += (share * def.yieldGrossPercent) / 100;
    durationSum += (share * def.durationYears) / 100;
    stateSum += share * def.stateExposureRatio;
  }

  const netRate = yieldSum / 100 * 0.87; // грубая оценка после НДФЛ 13%
  return {
    totalPercent,
    totalRub: Math.round((capitalRub * totalPercent) / 100),
    weightedYieldGross: Number(yieldSum.toFixed(2)),
    weightedDuration: Number(durationSum.toFixed(2)),
    stateExposurePercent: Number(stateSum.toFixed(1)),
    futureCapital3y: Math.round(capitalRub * Math.pow(1 + netRate, 3)),
    futureCapital5y: Math.round(capitalRub * Math.pow(1 + netRate, 5)),
  };
}

/** Арифметические инварианты §17. */
export function auditAllocation(
  summary: PortfolioSummary,
  capitalRub: number,
): AuditResult {
  const problems: string[] = [];
  const isSum100 = Math.abs(summary.totalPercent - 100) < 0.01;
  const isCapitalConsistent = Math.abs(summary.totalRub - capitalRub) < 1;
  const isYieldWithinBounds =
    summary.weightedYieldGross >= YIELD_MIN && summary.weightedYieldGross <= YIELD_MAX;

  if (!isSum100) problems.push(`Сумма долей ${summary.totalPercent}% ≠ 100%`);
  if (!isCapitalConsistent) problems.push("Сумма в рублях ≠ капиталу");
  if (!isYieldWithinBounds) problems.push("Доходность вне границ компонент [8; 17.5]%");

  return { isSum100, isCapitalConsistent, isYieldWithinBounds, problemsRu: problems };
}

/** Авто-балансировка: изменили один класс — остальные пропорционально к 100% (метод наибольших остатков). */
export function normalizeAllocation(
  current: Allocation,
  changedKey: AssetClassId,
  targetShare: number,
): Allocation {
  const target = Math.max(0, Math.min(100, Math.round(targetShare)));
  const rest = 100 - target;
  const others = ASSET_ORDER.filter((k) => k !== changedKey);
  const othersSum = others.reduce((acc, k) => acc + (current[k] ?? 0), 0);

  const result: Allocation = { ...current, [changedKey]: target };
  if (othersSum === 0) {
    for (const k of others) result[k] = 0;
    result[changedKey === "ofz_pd_ladder" ? "money_market" : "ofz_pd_ladder"] = rest;
    return result;
  }

  const fractions = others.map((k) => {
    const exactVal = ((current[k] ?? 0) / othersSum) * rest;
    return { k, floor: Math.floor(exactVal), fraction: exactVal - Math.floor(exactVal) };
  });
  let allocated = 0;
  for (const item of fractions) allocated += item.floor;

  let remainder = rest - allocated;
  for (const item of [...fractions].sort((a, b) => b.fraction - a.fraction)) {
    if (remainder > 0) {
      result[item.k] = item.floor + 1;
      remainder -= 1;
    } else {
      result[item.k] = item.floor;
    }
  }
  return result;
}

/** Минимальный риск: без акций, максимум ликвидности, вклады в пределах АСВ (5% ≈ 1.25 млн при 25 млн). */
export function optimizeMinRisk(): Allocation {
  return {
    money_market: 50,
    ofz_pd_ladder: 25,
    corporate_bonds: 5,
    replacement_bonds: 5,
    gold: 10,
    index_equities: 0,
    bank_deposits: 5,
  };
}

/** Максимум доходности СТРОГО внутри стоп-связки (поиск доли акций стресс-движком, шаг 1%). */
export function optimizeMaxYield(stopPercent: number): Allocation {
  const base: Allocation = {
    money_market: 5,
    ofz_pd_ladder: 0,
    corporate_bonds: 20,
    replacement_bonds: 15,
    gold: 7,
    index_equities: 0,
    bank_deposits: 0,
  };

  let bestEquities = 0;
  for (let equities = 0; equities <= 30; equities++) {
    const candidate: Allocation = { ...base, index_equities: equities };
    candidate.ofz_pd_ladder = 100 - 5 - 20 - 15 - 7 - equities;
    const results = runStressTests(candidate, 1, stopPercent);
    if (evaluateStopBinding(results, candidate, stopPercent).passes) {
      bestEquities = equities;
    }
  }

  return {
    ...base,
    index_equities: bestEquities,
    ofz_pd_ladder: 100 - 5 - 20 - 15 - 7 - bestEquities,
  };
}
