/**
 * @fileoverview Bank deposit calculator ( вклад).
 * Logic ported 1:1 from calculateBankProfit/clearBankForm in script.js.
 * showModal uses DOM API (createElement/createTextNode) — XSS-impossible (§8.3 fix).
 */

import { calculateTax } from "@shared/tax";
import { formatDecimal, formatNumber, parseFormattedNumber } from "@shared/format";

/** DOM helper: getElementById that throws clearly if the id is missing (broken contract). */
function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[bank] missing element #${id}`);
  return el;
}

function byInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`[bank] #${id} is not an input`);
  return el;
}

function byCheckbox(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`[bank] #${id} is not a checkbox`);
  return el;
}

/**
 * Render calculation details into the modal via DOM API (NO innerHTML).
 * Each paragraph is an array of lines; <br> separates lines within a paragraph.
 */
function showModal(paragraphs: string[][]): void {
  const modal = byId("calculationModal");
  const detailsContainer = byId("calculationDetails");

  detailsContainer.replaceChildren();
  for (const lines of paragraphs) {
    const p = document.createElement("p");
    lines.forEach((line, idx) => {
      if (idx > 0) p.appendChild(document.createElement("br"));
      p.appendChild(document.createTextNode(line));
    });
    detailsContainer.appendChild(p);
  }

  (modal as HTMLElement).style.display = "block";

  const span = document.getElementsByClassName("close")[0] as HTMLElement | undefined;
  if (span) {
    span.onclick = () => {
      modal.style.display = "none";
    };
  }

  window.onclick = (event: MouseEvent) => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  };
}

export function calculateBankProfit(): void {
  const messageEl = byId("profit");
  const initialAmountInput = byInput("amount");
  const periodInput = byInput("period");
  const annualPercentInput = byInput("percent");
  const monthlyDepositInput = byInput("monthly-deposit");
  const cbrRateInput = byInput("cbr-rate");

  const initialAmount = parseFormattedNumber(initialAmountInput.value);
  const period = parseInt(periodInput.value, 10);
  const annualPercent = parseFloat(annualPercentInput.value);
  const cbrRate = parseFloat(cbrRateInput.value) || 21;
  const isReinvest = byCheckbox("reinvest").checked;
  const isEscrow = byCheckbox("bank-escrow").checked;
  const isLowRate = byCheckbox("bank-low-rate").checked;
  const monthlyDeposit = parseFormattedNumber(monthlyDepositInput.value);
  const showHow = byCheckbox("show-how").checked;

  if (isNaN(initialAmount) || initialAmount <= 0) {
    messageEl.textContent = "Введите корректную сумму";
    initialAmountInput.focus();
    return;
  }

  if (isNaN(period) || period <= 0) {
    messageEl.textContent = "Введите корректный период";
    periodInput.focus();
    return;
  }

  if (isNaN(annualPercent) || annualPercent < 0) {
    messageEl.textContent = "Введите корректный годовой процент";
    annualPercentInput.focus();
    return;
  }

  if (isNaN(monthlyDeposit) || monthlyDeposit < 0) {
    messageEl.textContent = "Введите корректное пополнение";
    monthlyDepositInput.focus();
    return;
  }

  let totalAmount = initialAmount;
  let totalProfit = 0;
  let totalDepositsSum = 0;
  let maxBalance = initialAmount;
  const monthlyPercent = annualPercent / 12 / 100;

  const profitByYear: number[] = [];
  let currentYearProfit = 0;
  let monthInYear = 0;

  const details: string[][] = [];

  for (let i = 1; i <= period; i++) {
    const monthProfit = totalAmount * monthlyPercent;
    totalProfit += monthProfit;
    currentYearProfit += monthProfit;
    monthInYear++;

    if (monthInYear === 12 || i === period) {
      profitByYear.push(currentYearProfit);
      currentYearProfit = 0;
      monthInYear = 0;
    }

    if (isReinvest) {
      totalAmount += monthProfit;
    }

    totalAmount += monthlyDeposit;
    totalDepositsSum += monthlyDeposit;
    maxBalance = Math.max(maxBalance, totalAmount);

    if (showHow) {
      const lines = [`Месяц ${i}:`, `Прибыль: ${formatDecimal(monthProfit)} ₽`];
      if (isReinvest) lines.push(`Реинвестировано: ${formatDecimal(monthProfit)} ₽`);
      if (monthlyDeposit > 0) lines.push(`Пополнение: ${formatDecimal(monthlyDeposit)} ₽`);
      lines.push(`Итого на конец месяца: ${formatDecimal(totalAmount)} ₽`);
      details.push(lines);
    }
  }

  const noTax = isEscrow || isLowRate;
  const taxResult = noTax
    ? { yearlyLimit: 0, taxableIncome: 0, taxAmount: 0, taxFreeUsed: 0 }
    : calculateTax(profitByYear, maxBalance, cbrRate);

  const finalAmount = initialAmount + totalDepositsSum + totalProfit - taxResult.taxAmount;
  const yearlyProfit = (totalProfit / period) * 12;
  const monthlyProfit = totalProfit / period;

  byId("profit").textContent = formatNumber(totalProfit) + " ₽";
  byId("monthlyProfit").textContent = formatNumber(monthlyProfit) + " ₽";
  byId("yearlyProfit").textContent = formatNumber(yearlyProfit) + " ₽";

  byId("totalDeposit").textContent = formatNumber(initialAmount + totalDepositsSum + totalProfit) + " ₽";
  byId("initialDeposit").textContent = formatNumber(initialAmount) + " ₽";
  byId("totalDeposits").textContent = formatNumber(totalDepositsSum) + " ₽";
  byId("totalInterest").textContent = formatNumber(totalProfit) + " ₽";

  byId("taxFreeLimit").textContent = formatNumber(taxResult.yearlyLimit) + " ₽/год";
  byId("taxableAmount").textContent = formatNumber(taxResult.taxableIncome) + " ₽";
  byId("taxAmount").textContent = formatNumber(taxResult.taxAmount) + " ₽";
  byId("finalDeposit").textContent = formatNumber(finalAmount) + " ₽";

  if (showHow) {
    showModal(details);
  }
}

export function clearBankForm(): void {
  byInput("amount").value = "0";
  byInput("period").value = "12";
  byInput("percent").value = "10";
  byInput("cbr-rate").value = "21";
  byInput("monthly-deposit").value = "0";
  byCheckbox("reinvest").checked = false;
  byCheckbox("bank-escrow").checked = false;
  byCheckbox("bank-low-rate").checked = false;
  byCheckbox("show-how").checked = false;
  byId("profit").textContent = "0 ₽";
  byId("monthlyProfit").textContent = "0 ₽";
  byId("yearlyProfit").textContent = "0 ₽";
  byId("totalDeposit").textContent = "0 ₽";
  byId("initialDeposit").textContent = "0 ₽";
  byId("totalDeposits").textContent = "0 ₽";
  byId("totalInterest").textContent = "0 ₽";
  byId("taxFreeLimit").textContent = "0 ₽/год";
  byId("taxableAmount").textContent = "0 ₽";
  byId("taxAmount").textContent = "0 ₽";
  byId("finalDeposit").textContent = "0 ₽";
}
