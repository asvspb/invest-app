import "./calculators/bank";
import "./calculators/retail";
import "./calculators/currency";
import "./calculators/metals";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/calculators.css";
import "./styles/modal.css";

import { calculateBankProfit, clearBankForm } from "./calculators/bank";
import { calculateRetail, clearRetailForm } from "./calculators/retail";
import { calculateCurrency, clearCurrencyForm, fetchCbrRates } from "./calculators/currency";
import { calculateMetal, clearMetalForm, fetchCbrMetals } from "./calculators/metals";
import { fetchCbrRate } from "./cbr";
import { init } from "./init";
import { initTabs } from "./ui/tabs";
import { initTheme } from "./ui/theme";

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
  document.addEventListener("DOMContentLoaded", () => {
    init();
    initTabs();
    initTheme();
  });
} else {
  init();
  initTabs();
  initTheme();
}
