/**
 * @fileoverview Wealth Advisor v4.0 (методика docs/prompts/wealth-advisor-v4.md) — типы.
 * Портировано из finGuard (Senior Wealth Advisor v4.0) с исправлениями:
 * единый налоговый расчёт, чувствительность обрезки акций от байндящего сценария,
 * рыночные константы синхронизированы со срезом 14.10.2026.
 * Pure data contracts — no runtime, no DOM.
 */

/** Идентификаторы классов активов консультативного портфеля. */
export type AssetClassId =
  | "money_market"
  | "ofz_pd_ladder"
  | "corporate_bonds"
  | "replacement_bonds"
  | "gold"
  | "index_equities"
  | "bank_deposits";

/** Маркировка источника утверждения (§2 промпта v4). */
export type SourceTag = "факт" | "провайдер" | "модель" | "проверить";

/** Описание класса активов: доходность, дюрация, гос-экспозиция. */
export interface AssetClassDef {
  id: AssetClassId;
  nameRu: string;
  /** Категория роли в портфеле (§11). */
  roleRu: string;
  /** Ожидаемая брутто-доходность, % годовых [модель, срез 2026-10]. */
  yieldGrossPercent: number;
  /** Дюрация, лет (для чувствительности к ставке). */
  durationYears: number;
  /** Доля экспозиции на государство, 0..1 (§13). */
  stateExposureRatio: number;
  /** Инструменты-иллюстрации [провайдер]. */
  instrumentsRu: string;
  sourceTag: SourceTag;
}

/** Аллокация: доли классов в %, Σ = 100. */
export type Allocation = Record<AssetClassId, number>;

/** Сводка портфеля + арифметический аудит (§17). */
export interface PortfolioSummary {
  totalPercent: number;
  totalRub: number;
  weightedYieldGross: number;
  weightedDuration: number;
  stateExposurePercent: number;
  futureCapital3y: number;
  futureCapital5y: number;
}

export interface AuditResult {
  isSum100: boolean;
  isCapitalConsistent: boolean;
  isYieldWithinBounds: boolean;
  problemsRu: string[];
}

/** Один канонический стресс-сценарий (§9): impacto на цену класса, %. */
export interface StressScenario {
  id: string;
  titleRu: string;
  descRu: string;
  impacts: Record<AssetClassId, number>;
}

export interface StressScenarioResult {
  scenario: StressScenario;
  drawdownPercent: number;
  drawdownRub: number;
  postCrisisCapitalRub: number;
  violatesStop: boolean;
}

/** Стоп-связка (§7): худшая просадка ≤ |стоп| − буфер. */
export interface StopBinding {
  worstDrawdownPercent: number;
  worstScenarioTitleRu: string;
  effectiveThresholdPercent: number;
  passes: boolean;
  excessPercent: number;
  /** До скольки % резать акции (если не проходит). */
  recommendedEquityShare: number;
  verdictRu: string;
}

/** Единый налоговый расчёт портфеля (§10, версия правил 2026). */
export interface AdvisorTaxResult {
  taxRulesVersionRu: string;
  grossIncomeRub: number;
  depositExemptionRub: number;
  taxableBaseRub: number;
  taxAmountRub: number;
  effectiveRatePercent: number;
  netIncomeRub: number;
  netYieldPercent: number;
  ldvEligibleClasses: number;
  iis3DeadlineRu: string;
}

/** Сравнение вкладов с облигациями (§12). */
export interface DepositComparison {
  depositCapitalRub: number;
  isDiaCompliant: boolean;
  unprotectedRub: number;
  netDepositYieldPercent: number;
  netBondYieldPercent: number;
  bondAdvantageBps: number;
  trapsRu: string[];
}

/** Потолок доходности и плечо (§6). */
export interface YieldCeilingResult {
  honestCeilingGrossPercent: number;
  requestedYieldPercent: number;
  isContradictingStop: boolean;
  leverageGrossPercent: number;
  leverageFundingPercent: number;
  leverageWorstStressPercent: number;
}

/** Рефрейминг «от ставки к сумме» (§6 п.4). */
export interface ReframingResult {
  targetCapitalRub: number;
  yieldOnlyCapitalRub: number;
  deficitRub: number;
  requiredAnnualContributionRub: number;
}

/** Входы таба «Советник» (профиль клиента §4). */
export interface AdvisorInputs {
  capitalRub: number;
  horizonYears: number;
  /** Стоп-триггер, % (отрицательный, напр. −12.5). */
  stopPercent: number;
  /** Текущая ключевая ставка ЦБ, % [факт, cbr.ru]. */
  keyRatePercent: number;
  /** Максимальная ключевая ставка года, % — для льготы по вкладам [модель]. */
  maxKeyRateOfYearPercent: number;
  /** Запрошенная клиентом цель по доходности, %. */
  requestedYieldPercent: number;
  /** Целевая сумма к горизонту, ₽. */
  targetCapitalRub: number;
}
