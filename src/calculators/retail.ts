/**
 * @fileoverview Retail business calculator (выручка/себестоимость/расходы).
 * Logic ported 1:1 from calculateRetail/clearRetailForm in script.js.
 */

import { calculateTax } from "@shared/tax";
import { formatDecimal, formatNumber, parseFormattedNumber } from "@shared/format";
import type { RetailMetrics } from "@shared/types";

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[retail] missing element #${id}`);
  return el;
}

function byInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`[retail] #${id} is not an input`);
  return el;
}

/** Pure metrics: numbers in → RetailMetrics out, no DOM (AGENTS.md §6.2). */
export function calculateRetailMetrics(
  revenue: number,
  cost: number,
  expenses: number,
  period: number,
): RetailMetrics {
  const profit = revenue - cost - expenses;
  const invested = cost + expenses;
  const markup = cost > 0 ? (profit / cost) * 100 : 0;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const roi = invested > 0 ? (profit / invested) * 100 : 0;
  const yearlyYield = period > 0 ? (roi * 12) / period : 0;
  return { profit, markup, margin, roi, yearlyYield };
}

export function calculateRetail(): void {
  const messageEl = byId("retail-profit-amount");
  const revenueInput = byInput("retail-revenue");
  const costInput = byInput("retail-cost-price");
  const expensesInput = byInput("retail-expenses");
  const periodInput = byInput("retail-period");
  const cbrRateInput = byInput("retail-cbr-rate");

  const revenue = parseFormattedNumber(revenueInput.value);
  const cost = parseFormattedNumber(costInput.value);
  const expenses = parseFormattedNumber(expensesInput.value);
  const period = parseInt(periodInput.value, 10) || 0;
  const cbrRate = parseFloat(cbrRateInput.value) || 21;

  // Validation with inline DOM message (no alert — AGENTS.md §7).
  if (isNaN(revenue) || revenue < 0) {
    messageEl.textContent = "Введите корректную выручку";
    revenueInput.focus();
    return;
  }
  if (isNaN(cost) || cost < 0) {
    messageEl.textContent = "Введите корректную себестоимость";
    costInput.focus();
    return;
  }
  if (isNaN(expenses) || expenses < 0) {
    messageEl.textContent = "Введите корректные расходы";
    expensesInput.focus();
    return;
  }
  if (isNaN(period) || period <= 0) {
    messageEl.textContent = "Введите корректный период";
    periodInput.focus();
    return;
  }

  const { profit, markup, margin, roi, yearlyYield } = calculateRetailMetrics(
    revenue,
    cost,
    expenses,
    period,
  );

  // Loss is not taxed (Math.max). maxBalance = invested capital.
  const taxResult = calculateTax([Math.max(profit, 0)], cost + expenses, cbrRate);
  const finalAmount = profit - taxResult.taxAmount;

  byId("retail-profit-amount").textContent = formatNumber(profit) + " ₽";
  byId("retail-markup").textContent = formatDecimal(markup) + " %";
  byId("retail-margin").textContent = formatDecimal(margin) + " %";
  byId("retail-roi").textContent = formatDecimal(roi) + " %";
  byId("retail-yearly-yield").textContent = formatDecimal(yearlyYield) + " %";

  byId("retail-detail-revenue").textContent = formatNumber(revenue) + " ₽";
  byId("retail-detail-cost").textContent = formatNumber(cost) + " ₽";
  byId("retail-detail-expenses").textContent = formatNumber(expenses) + " ₽";

  byId("retail-taxAmount").textContent = formatNumber(taxResult.taxAmount) + " ₽";
  byId("retail-finalDeposit").textContent = formatNumber(finalAmount) + " ₽";
}

export function clearRetailForm(): void {
  byInput("retail-revenue").value = "0";
  byInput("retail-cost-price").value = "0";
  byInput("retail-expenses").value = "0";
  byInput("retail-period").value = "1";
  byInput("retail-cbr-rate").value = "21";
  byId("retail-profit-amount").textContent = "0 ₽";
  byId("retail-markup").textContent = "0 %";
  byId("retail-margin").textContent = "0 %";
  byId("retail-roi").textContent = "0 %";
  byId("retail-yearly-yield").textContent = "0 %";
  byId("retail-detail-revenue").textContent = "0 ₽";
  byId("retail-detail-cost").textContent = "0 ₽";
  byId("retail-detail-expenses").textContent = "0 ₽";
  byId("retail-taxAmount").textContent = "0 ₽";
  byId("retail-finalDeposit").textContent = "0 ₽";
}
