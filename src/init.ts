/**
 * @fileoverview DOMContentLoaded wiring: input formatting, defaults, synced CBR rate.
 * Logic ported 1:1 from the DOMContentLoaded handler in script.js.
 * Dead id 'retail-rate' (removed in retail-model refactor) dropped.
 */

import { formatInputNumber } from "@shared/format";
import { CBR_RATE_INPUTS, fetchCbrRate } from "./cbr";

function getInput(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

function initAmountInputs(): void {
  const amountInputs: Array<string> = [
    "amount",
    "retail-revenue",
    "retail-cost-price",
    "retail-expenses",
    "monthly-deposit",
    "currency-amount",
    "metal-amount",
  ];

  amountInputs.forEach((id) => {
    const input = getInput(id);
    if (!input) return;
    input.value = "0";
    input.addEventListener("input", () => formatInputNumber(input));
    input.addEventListener("blur", () => {
      if (input.value === "") input.value = "0";
    });
  });
}

function initPercentInputs(): void {
  const percentIds = [
    "percent",
    "cbr-rate",
    "retail-cbr-rate",
    "currency-sell-rate",
    "currency-buy-rate",
    "currency-cbr-rate",
    "metal-buy-price",
    "metal-sell-price",
    "metal-cbr-rate",
  ];

  percentIds.forEach((id) => {
    const percentInput = getInput(id);
    if (!percentInput) return;

    const isCbr = percentInput.id.includes("cbr-rate");
    const isMetalPrice =
      percentInput.id === "metal-buy-price" || percentInput.id === "metal-sell-price";
    percentInput.value = isCbr ? "21" : isMetalPrice ? "0" : percentInput.id === "percent" ? "10" : "0";

    percentInput.addEventListener("input", () => {
      let value = percentInput.value.replace(",", ".");
      value = value.replace(/[^\d.]/g, "");
      const parts = value.split(".");
      if (parts.length > 2) {
        value = parts[0] + "." + parts.slice(1).join("");
      }
      percentInput.value = value;
    });

    percentInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const step = parseFloat(percentInput.dataset.step ?? "") || 0.1;
        const min = parseFloat(percentInput.dataset.min ?? "") || 0;
        let currentValue = parseFloat(percentInput.value) || 0;

        if (e.key === "ArrowUp") {
          currentValue += step;
        } else {
          currentValue = Math.max(min, currentValue - step);
        }

        percentInput.value = currentValue.toFixed(1);
      }
    });

    percentInput.addEventListener("blur", () => {
      if (percentInput.value === "" || percentInput.value === ".") {
        percentInput.value = isCbr ? "21" : "0";
      }
    });
  });
}

function initDefaultInputs(): void {
  const defaults: Array<{ id: string; value: string }> = [
    { id: "retail-period", value: "1" },
    { id: "metal-hold-period", value: "365" },
  ];

  defaults.forEach(({ id, value }) => {
    const input = getInput(id);
    if (input) input.value = value;
  });
}

function initSyncedCbrRate(): void {
  CBR_RATE_INPUTS.forEach((id) => {
    const input = getInput(id);
    if (!input) return;
    input.addEventListener("input", () => {
      const val = input.value;
      CBR_RATE_INPUTS.forEach((otherId) => {
        if (otherId !== id) {
          const other = getInput(otherId);
          if (other) other.value = val;
        }
      });
    });
  });
}

export function init(): void {
  initAmountInputs();
  initPercentInputs();
  initDefaultInputs();
  initSyncedCbrRate();
  // Background fetch — silent on failure (default rate stays).
  void fetchCbrRate();
}
