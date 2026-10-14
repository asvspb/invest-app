/**
 * @fileoverview Precious metals calculator (Au/Ag/Pt/Pd).
 * Logic ported 1:1 from calculateMetal/fetchCbrMetals/clearMetalForm in script.js.
 * Module-level `lastCbrMetalPrice` replaces the former global mutable (AGENTS.md §6).
 */

import { calculateAssetRoundTrip } from "@shared/asset";
import { formatDecimal, formatNumber, parseFormattedNumber } from "@shared/format";
import type { CbrMetalsResponse } from "@shared/types";

// Module-scoped reference price (replaces global mutable lastCbrMetalPrice).
let lastCbrMetalPrice: number | null = null;

export function setLastCbrMetalPrice(price: number | null): void {
  lastCbrMetalPrice = price;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[metals] missing element #${id}`);
  return el;
}

function byInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`[metals] #${id} is not an input`);
  return el;
}

function bySelect(id: string): HTMLSelectElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLSelectElement)) throw new Error(`[metals] #${id} is not a select`);
  return el;
}

function byCheckbox(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`[metals] #${id} is not a checkbox`);
  return el;
}

export function fetchCbrMetals(): void {
  const btn = byId("metal-fetch-btn");
  const metalType = bySelect("metal-type").value;
  const buyInput = byInput("metal-buy-price");
  const sellInput = byInput("metal-sell-price");
  const cbrPriceSpan = byId("metal-cbr-price");

  btn.classList.add("loading");
  btn.textContent = "...";

  fetch("/api/cbr-metals")
    .then((resp: Response) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json() as Promise<CbrMetalsResponse>;
    })
    .then((data) => {
      const price = data.metals[metalType as keyof CbrMetalsResponse["metals"]];
      if (!price) throw new Error(`Металл ${metalType} не найден`);
      lastCbrMetalPrice = price;
      buyInput.value = price.toFixed(2);
      sellInput.value = price.toFixed(2);
      cbrPriceSpan.textContent = price.toFixed(2);
    })
    .catch((err: unknown) => {
      console.error("Failed to fetch CBR metals:", err);
      cbrPriceSpan.textContent = "нет данных";
    })
    .finally(() => {
      btn.classList.remove("loading");
      btn.textContent = "↻";
    });
}

export function calculateMetal(): void {
  const amountInput = byInput("metal-amount");
  const buyPriceInput = byInput("metal-buy-price");
  const sellPriceInput = byInput("metal-sell-price");
  const cbrRateInput = byInput("metal-cbr-rate");
  const holdPeriodInput = byInput("metal-hold-period");
  const messageEl = byId("metal-result");

  const amount = parseFormattedNumber(amountInput.value);
  const buyPrice = parseFloat(buyPriceInput.value);
  const sellPrice = parseFloat(sellPriceInput.value);
  const cbrRate = parseFloat(cbrRateInput.value) || 21;
  const holdPeriod = parseInt(holdPeriodInput.value, 10) || 0;

  if (isNaN(amount) || amount <= 0) {
    messageEl.textContent = "Введите корректную сумму";
    amountInput.focus();
    return;
  }
  if (isNaN(buyPrice) || buyPrice <= 0) {
    messageEl.textContent = "Введите корректную цену покупки";
    buyPriceInput.focus();
    return;
  }
  if (isNaN(sellPrice) || sellPrice <= 0) {
    messageEl.textContent = "Введите корректную цену продажи";
    sellPriceInput.focus();
    return;
  }
  if (isNaN(holdPeriod) || holdPeriod <= 0) {
    messageEl.textContent = "Введите корректный период владения";
    holdPeriodInput.focus();
    return;
  }

  const hasDocs = byCheckbox("metal-has-docs").checked;

  const r = calculateAssetRoundTrip({
    amount,
    buyPrice,
    sellPrice,
    refPrice: lastCbrMetalPrice ?? 0,
    keyRate: cbrRate,
    holdPeriod,
    hasPurchaseDocs: hasDocs,
  });

  const resultEl = byId("metal-result");
  resultEl.textContent = (r.profit >= 0 ? "+" : "") + formatNumber(r.profit) + " ₽";
  resultEl.className = r.profit >= 0 ? "profit-positive" : "profit-negative";

  byId("metal-bought").textContent = formatDecimal(r.units);
  byId("metal-sold-rub").textContent = formatNumber(r.rubAfterSell) + " ₽";

  const periodYieldEl = byId("metal-period-yield");
  const yearlyYieldEl = byId("metal-yearly-yield");
  periodYieldEl.textContent = formatDecimal(r.periodYield) + " %";
  periodYieldEl.className = r.periodYield >= 0 ? "profit-positive" : "profit-negative";
  yearlyYieldEl.textContent = formatDecimal(r.yearlyYield) + " %";
  yearlyYieldEl.className = r.yearlyYield >= 0 ? "profit-positive" : "profit-negative";

  byId("metal-spread-buy").textContent = formatDecimal(r.spreadBuy) + " ₽";
  byId("metal-margin-buy").textContent = formatDecimal(r.marginBuy) + " %";
  byId("metal-spread-sell").textContent = formatDecimal(r.spreadSell) + " ₽";
  byId("metal-margin-sell").textContent = formatDecimal(r.marginSell) + " %";
  byId("metal-spread").textContent = formatDecimal(r.totalSpread) + " ₽";
  byId("metal-margin").textContent = formatDecimal(r.marginTotal) + " %";

  byId("metal-hold-years").textContent = r.tax.holdingYears.toFixed(1);
  byId("metal-prop-tax-free").textContent = r.tax.isExempt ? "Да (≥3 лет)" : "Нет";
  byId("metal-prop-deduction").textContent = formatNumber(r.tax.deductionApplied) + " ₽";
  byId("metal-prop-taxable").textContent = formatNumber(r.tax.taxableIncome) + " ₽";
  byId("metal-prop-tax-amount").textContent =
    r.tax.isExempt ? "0 ₽ (освобождено)" : formatNumber(r.tax.taxAmount) + " ₽";
  byId("metal-finalDeposit").textContent = formatNumber(r.finalAmount) + " ₽";
}

export function clearMetalForm(): void {
  byInput("metal-amount").value = "0";
  byInput("metal-buy-price").value = "0";
  byInput("metal-sell-price").value = "0";
  byInput("metal-cbr-rate").value = "21";
  byInput("metal-hold-period").value = "365";
  byCheckbox("metal-has-docs").checked = true;
  byId("metal-result").textContent = "0 ₽";
  byId("metal-result").className = "";
  byId("metal-bought").textContent = "0";
  byId("metal-sold-rub").textContent = "0 ₽";
  byId("metal-period-yield").textContent = "0 %";
  byId("metal-period-yield").className = "";
  byId("metal-yearly-yield").textContent = "0 %";
  byId("metal-yearly-yield").className = "";
  byId("metal-spread-buy").textContent = "0 ₽";
  byId("metal-margin-buy").textContent = "0 %";
  byId("metal-spread-sell").textContent = "0 ₽";
  byId("metal-margin-sell").textContent = "0 %";
  byId("metal-spread").textContent = "0 ₽";
  byId("metal-margin").textContent = "0 %";
  byId("metal-hold-years").textContent = "0";
  byId("metal-prop-tax-free").textContent = "—";
  byId("metal-prop-deduction").textContent = "0 ₽";
  byId("metal-prop-taxable").textContent = "0 ₽";
  byId("metal-prop-tax-amount").textContent = "0 ₽";
  byId("metal-finalDeposit").textContent = "0 ₽";
}
