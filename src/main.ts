/**
 * @fileoverview Frontend entrypoint.
 *
 * Imports all calculator modules and exposes their handlers on `window` so the
 * existing HTML `onclick="..."` attributes keep working (minimal-regression
 * migration: no addEventListener rewrite yet — that's a separate task).
 *
 * Replaces the single 741-line public/script.js.
 */

import "./calculators/bank";
import "./calculators/retail";
import "./calculators/currency";
import "./calculators/metals";
import "../styles.css";

import { calculateBankProfit, clearBankForm } from "./calculators/bank";
import { calculateRetail, clearRetailForm } from "./calculators/retail";
import { calculateCurrency, clearCurrencyForm, fetchCbrRates } from "./calculators/currency";
import { calculateMetal, clearMetalForm, fetchCbrMetals } from "./calculators/metals";
import { fetchCbrRate } from "./cbr";
import { init } from "./init";

// --- window registry: keep HTML onclick="..." contract working ---
// Typed declaration so strict mode accepts the assignment.
declare global {
  interface Window {
    calculateBankProfit: typeof calculateBankProfit;
    clearBankForm: typeof clearBankForm;
    calculateRetail: typeof calculateRetail;
    clearRetailForm: typeof clearRetailForm;
    calculateCurrency: typeof calculateCurrency;
    clearCurrencyForm: typeof clearCurrencyForm;
    calculateMetal: typeof calculateMetal;
    clearMetalForm: typeof clearMetalForm;
    fetchCbrRate: typeof fetchCbrRate;
    fetchCbrRates: typeof fetchCbrRates;
    fetchCbrMetals: typeof fetchCbrMetals;
  }
}

window.calculateBankProfit = calculateBankProfit;
window.clearBankForm = clearBankForm;
window.calculateRetail = calculateRetail;
window.clearRetailForm = clearRetailForm;
window.calculateCurrency = calculateCurrency;
window.clearCurrencyForm = clearCurrencyForm;
window.calculateMetal = calculateMetal;
window.clearMetalForm = clearMetalForm;
window.fetchCbrRate = fetchCbrRate;
window.fetchCbrRates = fetchCbrRates;
window.fetchCbrMetals = fetchCbrMetals;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
