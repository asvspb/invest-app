/**
 * @fileoverview Таб «Советник» — рендеры результатов (чистый DOM API, textContent).
 * Рендер-слой методики v4: сводка, стоп-связка, стресс-сетка, потолок доходности,
 * налоги, вклады, аудит, отчёт. Данные приходят из @shared/advisor-* — здесь только DOM.
 */

import { formatNumber } from "@shared/format";
import type {
  AdvisorInputs,
  AdvisorTaxResult,
  Allocation,
  AuditResult,
  DepositComparison,
  PortfolioSummary,
  ReframingResult,
  StopBinding,
  StressScenarioResult,
  YieldCeilingResult,
} from "@shared/advisor-types";
import { ASSET_CLASSES } from "@shared/advisor-portfolio";
import type { AssetClassId } from "@shared/advisor-types";

const rub = (v: number): string => `${formatNumber(v)} ₽`;

function p(label: string, value: string, cls = "tax-info"): HTMLElement {
  const el = document.createElement("p");
  el.className = cls;
  el.textContent = `${label}: ${value}`;
  return el;
}

export function renderSummary(
  el: HTMLElement,
  summary: PortfolioSummary,
  tax: AdvisorTaxResult,
): void {
  const monthly = tax.netIncomeRub / 12;
  el.replaceChildren(
    p("Доходность (брутто)", `${summary.weightedYieldGross} %`, "tax-info"),
    p("Доходность (нетто)", `${tax.netYieldPercent} %`, "tax-highlight"),
    p("Дюрация портфеля", `${summary.weightedDuration} лет`),
    p("Гос-экспозиция (§13)", `≈ ${summary.stateExposurePercent} %`),
    p("Доход в месяц (нетто)", rub(monthly), "deposit-highlight"),
    p("Капитал через 3 / 5 лет", `${rub(summary.futureCapital3y)} / ${rub(summary.futureCapital5y)}`, "deposit-detail"),
  );
}

export function renderStopBinding(
  el: HTMLElement,
  binding: StopBinding,
  applyCutBtn: HTMLButtonElement,
): void {
  el.replaceChildren();
  el.classList.toggle("binding-fail", !binding.passes);
  el.classList.toggle("binding-pass", binding.passes);
  el.appendChild(p(binding.passes ? "✓" : "⚠", binding.verdictRu, "tax-highlight"));
  applyCutBtn.hidden = binding.passes;
}

export function renderStressGrid(
  el: HTMLElement,
  results: StressScenarioResult[],
): void {
  el.replaceChildren();
  for (const r of results) {
    const card = document.createElement("div");
    card.className = `stress-card ${r.violatesStop ? "stress-bad" : "stress-ok"}`;
    const title = document.createElement("div");
    title.className = "stress-title";
    title.textContent = r.scenario.titleRu;
    const dd = document.createElement("div");
    dd.className = "stress-dd";
    dd.textContent = `${r.drawdownPercent > 0 ? "+" : ""}${r.drawdownPercent}%`;
    const rubEl = document.createElement("div");
    rubEl.className = "stress-rub";
    rubEl.textContent = rub(r.drawdownRub);
    const desc = document.createElement("div");
    desc.className = "stress-desc";
    desc.textContent = r.scenario.descRu;
    card.replaceChildren(title, dd, rubEl, desc);
    el.appendChild(card);
  }
}

export function renderYield(
  el: HTMLElement,
  yc: YieldCeilingResult,
  reframing: ReframingResult,
  inputs: AdvisorInputs,
): void {
  const contradiction = document.createElement("p");
  contradiction.className = yc.isContradictingStop ? "tax-highlight" : "tax-info";
  contradiction.textContent = yc.isContradictingStop
    ? `Запрошено ${yc.requestedYieldPercent}% — ПРОТИВОРЕЧИТ стопу ${inputs.stopPercent}% (§6)`
    : `Запрошено ${yc.requestedYieldPercent}% — совместимо со стопом`;

  el.replaceChildren(
    p("Честный потолок внутри стопа", `${yc.honestCeilingGrossPercent} % брутто`, "deposit-highlight"),
    contradiction,
    p(
      `Плечо 1.4× (фондирование ${yc.leverageFundingPercent}%)`,
      `${yc.leverageGrossPercent} % брутто, но стресс ${yc.leverageWorstStressPercent}% — пробой стопа`,
    ),
    document.createElement("hr"),
    p(`Цель ${rub(reframing.targetCapitalRub)} за ${inputs.horizonYears} лет:`, "", "deposit-title"),
    p("Даёт только доходность", rub(reframing.yieldOnlyCapitalRub)),
    p("Дефицит", rub(reframing.deficitRub)),
    p(
      "Нужно пополнять",
      `${rub(reframing.requiredAnnualContributionRub)}/год — без роста риска`,
      "deposit-highlight",
    ),
  );
}

export function renderTax(
  el: HTMLElement,
  tax: AdvisorTaxResult,
): void {
  el.replaceChildren(
    p("Версия правил", tax.taxRulesVersionRu, "field-hint"),
    p("Доход (брутто)", rub(tax.grossIncomeRub)),
    p("Льгота по вкладам (агрегатная)", rub(tax.depositExemptionRub)),
    p("Налоговая база", rub(tax.taxableBaseRub)),
    p("НДФЛ к уплате", rub(tax.taxAmountRub), "tax-highlight"),
    p("Эффективная ставка", `${tax.effectiveRatePercent} %`),
    document.createElement("hr"),
    p(
      "ИИС-3",
      `дедлайн открытия ${tax.iis3DeadlineRu} (последний год); освобождение до 30 млн ₽`,
      "deposit-detail",
    ),
    p(
      "ЛДВ",
      `${tax.ldvEligibleClasses} класса-кандидата × 3 млн ₽/год владения; право после 3 лет с покупки (до — 0 ₽, порог)`,
      "deposit-detail",
    ),
  );
}

export function renderDeposit(
  el: HTMLElement,
  cmp: DepositComparison,
): void {
  const status = document.createElement("p");
  status.className = cmp.isDiaCompliant ? "tax-info" : "tax-highlight";
  status.textContent = cmp.depositCapitalRub === 0
    ? "Доля вкладов 0% — резерв во фондах денежного рынка"
    : cmp.isDiaCompliant
      ? `Вклады ${rub(cmp.depositCapitalRub)} — в пределах АСВ 1.4 млн ₽`
      : `Вклады ${rub(cmp.depositCapitalRub)} — ВНЕ лимита АСВ на ${rub(cmp.unprotectedRub)}!`;

  el.replaceChildren(
    status,
    p("Чистая ставка вклада (топ-APR)", `${cmp.netDepositYieldPercent} %`),
    p("Чистая YTM ОФЗ", `${cmp.netBondYieldPercent} %`),
    p("Преимущество ОФЗ", `${cmp.bondAdvantageBps} б.п.`, "tax-highlight"),
  );

  if (cmp.trapsRu.length > 0) {
    const list = document.createElement("ul");
    list.className = "trap-list";
    for (const trap of cmp.trapsRu) {
      const li = document.createElement("li");
      li.textContent = trap;
      list.appendChild(li);
    }
    el.appendChild(list);
  }
}

export function renderAudit(el: HTMLElement, audit: AuditResult): void {
  el.replaceChildren();
  if (audit.problemsRu.length === 0) {
    el.className = "audit-badge audit-ok";
    el.textContent = "Арифметический аудит §17: пройден (Σ долей = 100%, Σ₽ = капиталу)";
    return;
  }
  el.className = "audit-badge audit-bad";
  el.textContent = `Аудит §17: ${audit.problemsRu.join("; ")}`;
}

/** Строки таблицы аллокации: пересоздаются при смене пресета, значения — при вводе. */
export function buildAllocationRows(
  tbody: HTMLElement,
  allocation: Allocation,
  capitalRub: number,
  onShareChange: (id: AssetClassId, value: number) => void,
): void {
  tbody.replaceChildren();
  for (const id of Object.keys(ASSET_CLASSES) as AssetClassId[]) {
    const def = ASSET_CLASSES[id];
    const share = allocation[id] ?? 0;

    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.textContent = def.nameRu;
    nameTd.title = `${def.roleRu} [${def.sourceTag}]`;

    const inputTd = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.value = String(share);
    input.className = "share-input";
    input.addEventListener("change", () => {
      const v = Number(input.value);
      onShareChange(id, isNaN(v) ? 0 : v);
    });
    inputTd.appendChild(input);

    const rubTd = document.createElement("td");
    rubTd.className = "alloc-rub";
    rubTd.textContent = rub((capitalRub * share) / 100);

    const tagTd = document.createElement("td");
    tagTd.className = "alloc-tag";
    tagTd.textContent = `[${def.sourceTag}] ${def.yieldGrossPercent}%`;

    tr.replaceChildren(nameTd, inputTd, rubTd, tagTd);
    tbody.appendChild(tr);
  }
}

export function renderReport(pre: HTMLElement, reportText: string): void {
  pre.textContent = reportText;
}
