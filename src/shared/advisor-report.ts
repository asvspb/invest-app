/**
 * @fileoverview Канонический отчёт режима A (§16 методики v4).
 * Портировано из finGuard/reportHelpers (formatReportModeA) с исправлением:
 * верифицируемые факты берутся ПАРАМЕТРАМИ (ключевая ставка — из live-инпута),
 * а не зашиты устаревшими константами (у finGuard было 19% при факте 14%).
 * Pure string builder — no DOM.
 */

import type {
  AdvisorInputs,
  AdvisorTaxResult,
  Allocation,
  PortfolioSummary,
  StopBinding,
  YieldCeilingResult,
} from "./advisor-types";
import { ADVISOR_DISCLAIMER_RU, ASSET_CLASSES, ASSET_ORDER, PRIORITY_CHAIN_RU } from "./advisor-portfolio";
import { IIS3_DEADLINE_RU } from "./advisor-tax";

const rub = (v: number): string => `${Math.round(v).toLocaleString("ru-RU")} ₽`;

/** Текст заключения по структуре §16 (9 обязательных блоков). */
export function buildAdvisorReport(
  inputs: AdvisorInputs,
  allocation: Allocation,
  summary: PortfolioSummary,
  binding: StopBinding,
  tax: AdvisorTaxResult,
  yieldCeiling: YieldCeilingResult,
): string {
  const lines: string[] = [];

  lines.push("=== ЗАКЛЮЧЕНИЕ WEALTH-АДВИЗОРА (методика v4.0) ===");
  lines.push("РЕЖИМ A: ПОЛНЫЙ ПЛАН И СТРУКТУРА ПОРТФЕЛЯ (§16)");
  lines.push("");

  lines.push("1. ПРОВЕРЕННЫЕ ДАННЫЕ И ИСТОЧНИКИ [факт]:");
  lines.push(`- Ключевая ставка ЦБ: ${inputs.keyRatePercent.toFixed(1)}% [cbr.ru, live]`);
  lines.push("- Кривая ОФЗ 3–5 лет: YTM ~15.2% [MOEX ISS, 2026-10]");
  lines.push("- Госсектор IMOEX: ~26% без Сбера / ~40% с ним [MOEX ISS, 12.10.2026]");
  lines.push("");

  lines.push("2. ДОПУЩЕНИЯ [модель]:");
  lines.push("- Налоговое резидентство РФ (до подтверждения клиентом)");
  lines.push(`- Капитал ${rub(inputs.capitalRub)}, горизонт ${inputs.horizonYears} лет`);
  lines.push(`- Максимальная ключевая ставка года ${inputs.maxKeyRateOfYearPercent}% (льгота вкладов)`);
  lines.push("");

  lines.push("3. РЕКОМЕНДУЕМАЯ СТРУКТУРА ПОРТФЕЛЯ:");
  for (const id of ASSET_ORDER) {
    const share = allocation[id] ?? 0;
    if (share === 0) continue;
    const def = ASSET_CLASSES[id];
    lines.push(
      `- ${def.nameRu}: ${share}% (${rub((inputs.capitalRub * share) / 100)}) — ${def.instrumentsRu} [${def.sourceTag}]`,
    );
  }
  lines.push(`Ожидаемая доходность брутто: ~${summary.weightedYieldGross}% годовых.`);
  lines.push(`Гос-экспозиция портфеля: ~${summary.stateExposurePercent}% (§13).`);
  lines.push("");

  lines.push("4. НАЛОГОВЫЙ СЛОЙ (§10):");
  lines.push(`Версия правил: ${tax.taxRulesVersionRu}`);
  lines.push(`- Доход ${rub(tax.grossIncomeRub)}, база ${rub(tax.taxableBaseRub)}, НДФЛ ${rub(tax.taxAmountRub)}`);
  lines.push(`- Чистая доходность: ${tax.netYieldPercent}% годовых`);
  lines.push(`- ЛДВ: классов-кандидатов ${tax.ldvEligibleClasses} (3 млн ₽/год владения; право после 3 лет с даты покупки — порог, до отметки 0 ₽)`);
  lines.push(`- ИИС-3: открытие до ${IIS3_DEADLINE_RU} на ${5} лет, освобождение до 30 млн ₽`);
  lines.push("");

  lines.push("5. СТРЕСС-ТЕСТИРОВАНИЕ И СТОП-СВЯЗКА (§7, §9):");
  lines.push(`- Худший сценарий: «${binding.worstScenarioTitleRu}», просадка ${binding.worstDrawdownPercent}%`);
  lines.push(`- Стоп-триггер: ${inputs.stopPercent}% (порог с буфером ${binding.effectiveThresholdPercent}%)`);
  lines.push(`- Результат: ${binding.passes ? "стресс-связка ВЫПОЛНЯЕТСЯ" : "НЕ ВЫПОЛНЯЕТСЯ — резать акции"}`);
  lines.push("");

  lines.push("6. ПОТОЛОК ДОХОДНОСТИ (§6):");
  lines.push(
    `- Честный потолок внутри стопа: ${yieldCeiling.honestCeilingGrossPercent}% брутто`
    + ` (запрошено ${yieldCeiling.requestedYieldPercent}%`
    + `${yieldCeiling.isContradictingStop ? " — противоречит стопу)" : " — совместимо)"}`,
  );
  lines.push(
    `- Плечо 1.4×: ${yieldCeiling.leverageGrossPercent}% брутто,`
    + ` но худший стресс ${yieldCeiling.leverageWorstStressPercent}% — пробой стопа`,
  );
  lines.push("");

  lines.push("7. ШАГИ ИСПОЛНЕНИЯ [проверить]:");
  lines.push(`- Открыть ИИС-3 до ${IIS3_DEADLINE_RU} (последний год)`);
  lines.push("- ОФЗ — лимитными заявками; проверить комиссии брокера на замещающие и золото");
  lines.push("");

  lines.push("8. ТРИГГЕРЫ ПЕРЕСМОТРА:");
  lines.push("- Отклонение долей ±5 п.п.; изменение ключевой ≥2 п.п.; просадка к стоп − буфер");
  lines.push("");

  lines.push(`Приоритеты: ${PRIORITY_CHAIN_RU}.`);
  lines.push("");
  lines.push(ADVISOR_DISCLAIMER_RU);

  return lines.join("\n");
}
