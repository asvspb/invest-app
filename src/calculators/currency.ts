/**
 * @fileoverview Currency calculator (buy-low/sell-high on FX).
 * Logic ported 1:1 from calculateCurrency/fetchCbrRates/clearCurrencyForm in script.js.
 * Module-level `lastCbrExchangeRate` replaces the former global mutable (AGENTS.md §6).
 */

import { calculateAssetRoundTrip } from "@shared/asset";
import { formatDecimal, formatNumber, parseFormattedNumber } from "@shared/format";
import type { CbrRatesResponse } from "@shared/types";

// Module-scoped reference price (replaces global mutable lastCbrExchangeRate).
let lastCbrExchangeRate: number | null = null;

export function setLastCbrExchangeRate(rate: number | null): void {
  lastCbrExchangeRate = rate;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[currency] missing element #${id}`);
  return el;
}

function byInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`[currency] #${id} is not an input`);
  return el;
}

function bySelect(id: string): HTMLSelectElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLSelectElement)) throw new Error(`[currency] #${id} is not a select`);
  return el;
}

export function fetchCbrRates(): void {
  const btn = byId("fetch-cbr-rates-btn");
  const code = bySelect("currency-code").value;
  const sellInput = byInput("currency-sell-rate");
  const buyInput = byInput("currency-buy-rate");
  const cbrRateSpan = byId("currency-cbr-exchange-rate");

  btn.classList.add("loading");
  btn.textContent = "...";

  fetch("/api/cbr-rates")
    .then((resp: Response) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json() as Promise<CbrRatesResponse>;
    })
    .then((data) => {
      const rate = data.rates[code];
      if (!rate) throw new Error(`Валюта ${code} не найдена`);
      lastCbrExchangeRate = rate;
      sellInput.value = rate.toFixed(2);
      buyInput.value = rate.toFixed(2);
      byId("currency-cbr-exchange-rate").textContent = rate.toFixed(2);
    })
    .catch((err: unknown) => {
      console.error("Failed to fetch CBR rates:", err);
      cbrRateSpan.textContent = "нет данных";
    })
    .finally(() => {
      btn.classList.remove("loading");
      btn.textContent = "↻";
    });
}

export function calculateCurrency(): void {
  const messageEl = byId("currency-result");
  const amountInput = byInput("currency-amount");
  const sellRateInput = byInput("currency-sell-rate");
  const buyRateInput = byInput("currency-buy-rate");
  const cbrRateInput = byInput("currency-cbr-rate");
  const holdPeriodInput = byInput("currency-hold-period");

  const amount = parseFormattedNumber(amountInput.value);
  const sellRate = parseFloat(sellRateInput.value);
  const buyRate = parseFloat(buyRateInput.value);
  const cbrRate = parseFloat(cbrRateInput.value) || 21;
  const holdPeriod = parseInt(holdPeriodInput.value, 10) || 1;

  if (isNaN(amount) || amount <= 0) {
    messageEl.textContent = "Введите корректную сумму";
    amountInput.focus();
    return;
  }

  if (isNaN(sellRate) || sellRate <= 0) {
    messageEl.textContent = "Введите корректный курс покупки";
    sellRateInput.focus();
    return;
  }

  if (isNaN(buyRate) || buyRate <= 0) {
    messageEl.textContent = "Введите корректный курс продажи";
    buyRateInput.focus();
    return;
  }

  const r = calculateAssetRoundTrip({
    amount,
    buyPrice: sellRate,
    sellPrice: buyRate,
    refPrice: lastCbrExchangeRate ?? 0,
    keyRate: cbrRate,
    holdPeriod,
  });

  const resultEl = byId("currency-result");
  resultEl.textContent = (r.profit >= 0 ? "+" : "") + formatNumber(r.profit) + " ₽";
  resultEl.className = r.profit >= 0 ? "profit-positive" : "profit-negative";

  byId("currency-bought").textContent = formatDecimal(r.units);
  byId("currency-sold-rub").textContent = formatNumber(r.rubAfterSell) + " ₽";

  const periodYieldEl = byId("currency-period-yield");
  const yearlyYieldEl = byId("currency-yearly-yield");
  periodYieldEl.textContent = formatDecimal(r.periodYield) + " %";
  periodYieldEl.className = r.periodYield >= 0 ? "profit-positive" : "profit-negative";
  yearlyYieldEl.textContent = formatDecimal(r.yearlyYield) + " %";
  yearlyYieldEl.className = r.yearlyYield >= 0 ? "profit-positive" : "profit-negative";

  byId("currency-spread-sell").textContent =
    (r.spreadBuy >= 0 ? "+" : "") + formatDecimal(r.spreadBuy) + " ₽";
  byId("currency-margin-sell").textContent = formatDecimal(r.marginBuy) + " %";
  byId("currency-spread-buy").textContent =
    (r.spreadSell >= 0 ? "+" : "") + formatDecimal(r.spreadSell) + " ₽";
  byId("currency-margin-buy").textContent = formatDecimal(r.marginSell) + " %";
  byId("currency-spread").textContent = formatDecimal(r.totalSpread) + " ₽";
  byId("currency-margin").textContent = formatDecimal(r.marginTotal) + " %";

  byId("currency-taxFreeLimit").textContent = formatNumber(r.tax.yearlyLimit) + " ₽/год";
  byId("currency-taxableAmount").textContent = formatNumber(r.tax.taxableIncome) + " ₽";
  byId("currency-taxAmount").textContent = formatNumber(r.tax.taxAmount) + " ₽";
  byId("currency-finalDeposit").textContent = formatNumber(r.finalAmount) + " ₽";
}

export function clearCurrencyForm(): void {
  byInput("currency-amount").value = "0";
  byInput("currency-sell-rate").value = "0";
  byInput("currency-buy-rate").value = "0";
  byInput("currency-cbr-rate").value = "21";
  byInput("currency-hold-period").value = "1";
  byId("currency-result").textContent = "0 ₽";
  byId("currency-result").className = "";
  byId("currency-bought").textContent = "0";
  byId("currency-sold-rub").textContent = "0 ₽";
  byId("currency-period-yield").textContent = "0 %";
  byId("currency-period-yield").className = "";
  byId("currency-yearly-yield").textContent = "0 %";
  byId("currency-yearly-yield").className = "";
  byId("currency-spread-sell").textContent = "0 ₽";
  byId("currency-margin-sell").textContent = "0 %";
  byId("currency-spread-buy").textContent = "0 ₽";
  byId("currency-margin-buy").textContent = "0 %";
  byId("currency-spread").textContent = "0 ₽";
  byId("currency-margin").textContent = "0 %";
  byId("currency-taxFreeLimit").textContent = "0 ₽/год";
  byId("currency-taxableAmount").textContent = "0 ₽";
  byId("currency-taxAmount").textContent = "0 ₽";
  byId("currency-finalDeposit").textContent = "0 ₽";
}
