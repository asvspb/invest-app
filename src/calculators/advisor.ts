/**
 * @fileoverview Таб «Советник» — состояние, инициализация, пересчёт (методика v4).
 * Порт лучшего из finGuard: пресеты планов, авто-балансировка долей, стоп-связка
 * с командой обрезки, канон-отчёт с копированием. Слушатели — addEventListener
 * (не onclick-реестр: новое UI, §8 tech-debt direction).
 */

import { formatNumber, parseFormattedNumber } from "@shared/format";
import type { AdvisorInputs, Allocation, AssetClassId } from "@shared/advisor-types";
import {
  ASSET_CLASSES,
  PLAN_CAUTIOUS_SHARES,
  PLAN_V2_SHARES,
  PRIORITY_CHAIN_RU,
  auditAllocation,
  calcPortfolioSummary,
  normalizeAllocation,
  optimizeMaxYield,
  optimizeMinRisk,
} from "@shared/advisor-portfolio";
import { evaluateStopBinding, runStressTests } from "@shared/advisor-stress";
import { calcAdvisorTax, compareDepositsVsBonds } from "@shared/advisor-tax";
import { analyzeReframing, analyzeYieldCeiling, unleveredWorstStress } from "@shared/advisor-yield";
import { buildAdvisorReport } from "@shared/advisor-report";
import {
  buildAllocationRows,
  renderAudit,
  renderDeposit,
  renderReport,
  renderStopBinding,
  renderStressGrid,
  renderSummary,
  renderTax,
  renderYield,
} from "./advisor-view";

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[advisor] missing element #${id}`);
  return el;
}

function byInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`[advisor] #${id} is not an input`);
  return el;
}

function byButton(id: string): HTMLButtonElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`[advisor] #${id} is not a button`);
  return el;
}

const DEFAULTS = { capital: 25_000_000, horizon: 4, stop: 12.5, keyRate: 14, maxKeyRate: 16, targetYield: 20, targetCapital: 50_000_000 };

let allocation: Allocation = { ...PLAN_V2_SHARES };

function readInputs(): AdvisorInputs | null {
  const errorEl = byId("adv-error");
  const capital = parseFormattedNumber(byInput("adv-capital").value);
  const horizon = Number(byInput("adv-horizon").value);
  const stopAbs = Math.abs(Number(byInput("adv-stop").value));
  const keyRate = Number(byInput("adv-keyrate").value);
  const maxKeyRate = Number(byInput("adv-maxkeyrate").value);
  const targetYield = Number(byInput("adv-target-yield").value);
  const targetCapital = parseFormattedNumber(byInput("adv-target-capital").value);

  if (capital <= 0 || horizon < 1 || horizon > 20 || stopAbs <= 0 || keyRate <= 0) {
    errorEl.textContent = "Проверьте поля: капитал > 0, горизонт 1–20 лет, стоп и ключевая ставка > 0";
    return null;
  }
  errorEl.textContent = "";
  return {
    capitalRub: capital,
    horizonYears: Math.round(horizon),
    stopPercent: -stopAbs,
    keyRatePercent: keyRate,
    maxKeyRateOfYearPercent: maxKeyRate > 0 ? maxKeyRate : keyRate,
    requestedYieldPercent: targetYield,
    targetCapitalRub: targetCapital > 0 ? targetCapital : capital,
  };
}

function recalc(): void {
  const inputs = readInputs();
  if (!inputs) return;

  const summary = calcPortfolioSummary(allocation, inputs.capitalRub);
  const audit = auditAllocation(summary, inputs.capitalRub);
  const tax = calcAdvisorTax(allocation, inputs.capitalRub, inputs.maxKeyRateOfYearPercent);
  const stress = runStressTests(allocation, inputs.capitalRub, inputs.stopPercent);
  const binding = evaluateStopBinding(stress, allocation, inputs.stopPercent);
  const worst = unleveredWorstStress(allocation, inputs.stopPercent);
  const ceiling = analyzeYieldCeiling(inputs.stopPercent, inputs.requestedYieldPercent, worst);
  const reframing = analyzeReframing(
    inputs.capitalRub,
    inputs.targetCapitalRub,
    tax.netYieldPercent,
    inputs.horizonYears,
  );
  const deposit = compareDepositsVsBonds(allocation, inputs.capitalRub, inputs.maxKeyRateOfYearPercent);

  renderSummary(byId("adv-summary"), summary, tax);
  renderStopBinding(byId("adv-stopbinding"), binding, byButton("adv-apply-cut"));
  renderStressGrid(byId("adv-stress"), stress);
  renderYield(byId("adv-yield"), ceiling, reframing, inputs);
  renderTax(byId("adv-tax"), tax);
  renderDeposit(byId("adv-deposit"), deposit);
  renderAudit(byId("adv-audit"), audit);
  renderReport(
    byId("adv-report-text"),
    buildAdvisorReport(inputs, allocation, summary, binding, tax, ceiling),
  );

  byId("adv-plan-label").textContent =
    `План: доли Σ ${summary.totalPercent}% · гос-экспозиция ≈ ${summary.stateExposurePercent}%`
    + ` · дюрация ${summary.weightedDuration} лет`;
}

function setAllocation(next: Allocation, inputs: AdvisorInputs): void {
  allocation = next;
  buildAllocationRows(
    byId("adv-allocation-rows"),
    allocation,
    inputs.capitalRub,
    onShareChange,
  );
}

function currentInputsOrRevert(): AdvisorInputs {
  const inputs = readInputs();
  return inputs ?? {
    capitalRub: DEFAULTS.capital,
    horizonYears: DEFAULTS.horizon,
    stopPercent: -DEFAULTS.stop,
    keyRatePercent: DEFAULTS.keyRate,
    maxKeyRateOfYearPercent: DEFAULTS.maxKeyRate,
    requestedYieldPercent: DEFAULTS.targetYield,
    targetCapitalRub: DEFAULTS.targetCapital,
  };
}

function onShareChange(id: AssetClassId, value: number): void {
  const inputs = currentInputsOrRevert();
  allocation = byInput("adv-autobalance").checked
    ? normalizeAllocation(allocation, id, value)
    : { ...allocation, [id]: Math.max(0, Math.min(100, value)) };
  setAllocation(allocation, inputs);
  recalc();
}

function initListeners(): void {
  const recalcFields = ["adv-capital", "adv-horizon", "adv-stop", "adv-keyrate", "adv-maxkeyrate", "adv-target-yield", "adv-target-capital"];
  for (const id of recalcFields) {
    byInput(id).addEventListener("change", () => {
      if (id === "adv-capital" || id === "adv-target-capital") {
        const input = byInput(id);
        input.value = formatNumber(parseFormattedNumber(input.value));
      }
      const inputs = currentInputsOrRevert();
      setAllocation(allocation, inputs);
      recalc();
    });
  }

  byButton("adv-preset-v2").addEventListener("click", () => { allocation = { ...PLAN_V2_SHARES }; setAllocation(allocation, currentInputsOrRevert()); recalc(); });
  byButton("adv-preset-cautious").addEventListener("click", () => { allocation = { ...PLAN_CAUTIOUS_SHARES }; setAllocation(allocation, currentInputsOrRevert()); recalc(); });
  byButton("adv-preset-maxyield").addEventListener("click", () => { allocation = optimizeMaxYield(currentInputsOrRevert().stopPercent); setAllocation(allocation, currentInputsOrRevert()); recalc(); });
  byButton("adv-preset-minrisk").addEventListener("click", () => { allocation = optimizeMinRisk(); setAllocation(allocation, currentInputsOrRevert()); recalc(); });

  byButton("adv-apply-cut").addEventListener("click", () => {
    const inputs = currentInputsOrRevert();
    const stress = runStressTests(allocation, inputs.capitalRub, inputs.stopPercent);
    const binding = evaluateStopBinding(stress, allocation, inputs.stopPercent);
    const cut = binding.recommendedEquityShare;
    const movedTo = allocation.index_equities - cut;
    allocation = {
      ...allocation,
      index_equities: cut,
      ofz_pd_ladder: allocation.ofz_pd_ladder + movedTo,
    };
    setAllocation(allocation, inputs);
    recalc();
  });

  byButton("adv-copy-report").addEventListener("click", () => {
    const text = byId("adv-report-text").textContent ?? "";
    void navigator.clipboard
      .writeText(text)
      .then(() => { byId("adv-copy-report").textContent = "Скопировано ✓"; })
      .catch(() => { byId("adv-copy-report").textContent = "Не удалось скопировать"; })
      .finally(() => {
        setTimeout(() => { byId("adv-copy-report").textContent = "Копировать отчёт"; }, 2500);
      });
  });

  byInput("adv-autobalance").addEventListener("change", recalc);
}

/** Вызывается из main.ts на DOMContentLoaded. */
export function initAdvisor(): void {
  byInput("adv-capital").value = formatNumber(DEFAULTS.capital);
  byInput("adv-horizon").value = String(DEFAULTS.horizon);
  byInput("adv-stop").value = String(DEFAULTS.stop);
  byInput("adv-keyrate").value = String(DEFAULTS.keyRate);
  byInput("adv-maxkeyrate").value = String(DEFAULTS.maxKeyRate);
  byInput("adv-target-yield").value = String(DEFAULTS.targetYield);
  byInput("adv-target-capital").value = formatNumber(DEFAULTS.targetCapital);
  byId("adv-priority").textContent = `Приоритеты §1: ${PRIORITY_CHAIN_RU}`;

  initListeners();
  setAllocation({ ...PLAN_V2_SHARES }, currentInputsOrRevert());
  recalc();
}

// Пригодится для отладки в консоли; не входит в onclick-реестр.
export const __advisorDebug = {
  getAllocation: (): Readonly<Allocation> => allocation,
  assetNames: (): string[] => Object.keys(ASSET_CLASSES),
};
