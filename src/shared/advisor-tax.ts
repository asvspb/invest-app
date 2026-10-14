/**
 * @fileoverview Налоговый слой советника (§10, §12 методики v4).
 * Портировано из finGuard с исправлением: ЕДИНЫЙ расчёт (у finGuard налог в
 * useTaxCalculations и useCashFlowCalculations считался по-разному — с льготой
 * по вкладам и без неё). Прогрессивная шкала переиспользуется из @shared/tax.
 * Pure functions — no DOM.
 */

import { applyProgressiveTax } from "./tax";
import type {
  AdvisorTaxResult,
  Allocation,
  DepositComparison,
} from "./advisor-types";
import { ASSET_CLASSES, ASSET_ORDER } from "./advisor-portfolio";

export const TAX_RULES_VERSION_RU = "НК РФ, редакция 2025–2026 — проверить на дату сделки";

/** ЛДВ (ст. 219.1 НК РФ): право после более 3 лет владения (порог — до отметки 0 ₽), далее 3 млн ₽ за каждый полный год; бумаги МосБиржи. */
export const LDV_ANNUAL_EXEMPTION_RUB = 3_000_000;

/** ИИС-3 (§10): дедлайн открытия — 31.12.2026. */
export const IIS3_DEADLINE_RU = "31.12.2026";
export const IIS3_MIN_YEARS = 5;
export const IIS3_PROFIT_EXEMPTION_MAX_RUB = 30_000_000;
export const IIS3_CONTRIBUTION_BASE_RUB = 400_000;
export const IIS3_MAX_RETURN_13_RUB = 52_000;
export const IIS3_MAX_RETURN_15_RUB = 60_000;

/** АСВ: 1.4 млн базово + 2.8 млн по безотзывным >3 лет (правило с 30.10.2025). */
export const DIA_BASE_LIMIT_RUB = 1_400_000;
export const DIA_LONG_TERM_LIMIT_RUB = 2_800_000;

/** Льгота по вкладам: не облагается 1 млн ₽ × МАКСИМАЛЬНАЯ ключевая ставка года [модель]. */
export const DEPOSIT_EXEMPTION_BASE_RUB = 1_000_000;
export const DEFAULT_MAX_KEY_RATE_OF_YEAR_PERCENT = 16.0;

/** Ориентир топ-APR вкладов [провайдер, banki.ru 13.10.2026]. */
const DEPOSIT_TOP_APR_PERCENT = 14.1;
/** YTM лестницы ОФЗ [факт, MOEX 2026-10]. */
const OFZ_YTM_PERCENT = 15.2;

const DEPOSIT_TRAPS_RU: string[] = [
  "Лестничные ставки: заявленный номинал действует первый период, эффективная APR ниже",
  "«Новые деньги»: пролонгация со скидкой 200–300 б.п.",
  "Кросс-продукты (ИСЖ/НСЖ, подписки) режут реальную доходность",
  "Реинвестирование: при смягчении ДКП новая ставка будет ниже",
];

/** Единый налоговый расчёт портфеля: льгота вкладов агрегатная + прогрессивный НДФЛ. */
export function calcAdvisorTax(
  allocation: Allocation,
  capitalRub: number,
  maxKeyRateOfYearPercent: number,
): AdvisorTaxResult {
  let grossIncome = 0;
  let ldvEligibleClasses = 0;

  for (const id of ASSET_ORDER) {
    const share = allocation[id] ?? 0;
    if (share === 0) continue;
    const assetCapital = (capitalRub * share) / 100;
    grossIncome += (assetCapital * ASSET_CLASSES[id].yieldGrossPercent) / 100;
    if (id === "ofz_pd_ladder" || id === "corporate_bonds" || id === "index_equities") {
      ldvEligibleClasses += 1;
    }
  }

  const depositShare = allocation.bank_deposits ?? 0;
  const depositIncome =
    (capitalRub * depositShare * ASSET_CLASSES.bank_deposits.yieldGrossPercent) / 10_000;
  const depositExemption =
    DEPOSIT_EXEMPTION_BASE_RUB * (maxKeyRateOfYearPercent / 100);
  const taxableDepositIncome = Math.max(0, depositIncome - depositExemption);

  const taxableBase = grossIncome - depositIncome + taxableDepositIncome;
  const taxAmount = applyProgressiveTax(taxableBase);
  const netIncome = grossIncome - taxAmount;

  return {
    taxRulesVersionRu: TAX_RULES_VERSION_RU,
    grossIncomeRub: Math.round(grossIncome),
    depositExemptionRub: Math.round(depositExemption),
    taxableBaseRub: Math.round(taxableBase),
    taxAmountRub: Math.round(taxAmount),
    effectiveRatePercent:
      taxableBase > 0 ? Number(((taxAmount / taxableBase) * 100).toFixed(2)) : 0,
    netIncomeRub: Math.round(netIncome),
    netYieldPercent:
      capitalRub > 0 ? Number(((netIncome / capitalRub) * 100).toFixed(2)) : 0,
    ldvEligibleClasses,
    iis3DeadlineRu: IIS3_DEADLINE_RU,
  };
}

/** Вычет ИИС-3 типа «взнос»: min(взнос, 400 тыс.) × ставку НДФЛ. */
export function iis3ContributionReturn(
  annualContributionRub: number,
  marginalRatePercent: 13 | 15,
): number {
  const base = Math.min(Math.max(annualContributionRub, 0), IIS3_CONTRIBUTION_BASE_RUB);
  return Math.round((base * marginalRatePercent) / 100);
}

/** Сравнение вкладов с ОФЗ после налогов + лимиты АСВ + ловушки (§12). */
export function compareDepositsVsBonds(
  allocation: Allocation,
  capitalRub: number,
  maxKeyRateOfYearPercent: number,
): DepositComparison {
  const depositCapitalRub =
    (capitalRub * (allocation.bank_deposits ?? 0)) / 100;
  const isDiaCompliant = depositCapitalRub <= DIA_BASE_LIMIT_RUB;
  const unprotectedRub = Math.max(0, depositCapitalRub - DIA_BASE_LIMIT_RUB);

  // Чистые доходности: вклад — с льготой не облагается часть процентов;
  // ОФЗ — 13% без ЛДВ (право на ЛДВ возникает только после 3 лет владения с даты покупки).
  const exemption = DEPOSIT_EXEMPTION_BASE_RUB * (maxKeyRateOfYearPercent / 100);
  const depositTaxableFactor = Math.max(0, 1 - exemption / Math.max(depositCapitalRub * DEPOSIT_TOP_APR_PERCENT / 100, 1));
  const netDeposit = DEPOSIT_TOP_APR_PERCENT * (1 - 0.13 * depositTaxableFactor);
  const netBond = OFZ_YTM_PERCENT * (1 - 0.13);

  const traps = [...DEPOSIT_TRAPS_RU];
  if (unprotectedRub > 0) {
    traps.unshift(
      `Вне страховки АСВ: ${Math.round(unprotectedRub).toLocaleString("ru-RU")} ₽ `
      + `(лимит 1.4 млн; по безотзывным >3 лет +2.8 млн)`,
    );
  }

  return {
    depositCapitalRub: Math.round(depositCapitalRub),
    isDiaCompliant,
    unprotectedRub: Math.round(unprotectedRub),
    netDepositYieldPercent: Number(netDeposit.toFixed(2)),
    netBondYieldPercent: Number(netBond.toFixed(2)),
    bondAdvantageBps: Math.round((netBond - netDeposit) * 100),
    trapsRu: traps,
  };
}
