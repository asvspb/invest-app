/**
 * @fileoverview CBR key-rate fetch — shared across all 4 calculators.
 * Updates all CBR_RATE_INPUTS fields simultaneously (synced key rate UX).
 * Logic ported 1:1 from fetchCbrRate in script.js; silent on failure
 * (background fetch, default rate 21 stays — AGENTS.md §8.5 fix).
 */

import type { CbrRateResponse } from "@shared/types";

/** Input ids that share the synced CBR key rate across calculators. */
export const CBR_RATE_INPUTS = [
  "cbr-rate",
  "currency-cbr-rate",
  "metal-cbr-rate",
] as const;

export async function fetchCbrRate(): Promise<void> {
  const allBtns = document.querySelectorAll<HTMLButtonElement>(".btn-fetch-cbr");
  allBtns.forEach((b) => {
    b.classList.add("loading");
    b.textContent = "...";
  });

  try {
    const resp = await fetch("/api/cbr-key-rate?refresh=true");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as CbrRateResponse;
    const rate = parseFloat(String(data.rate));
    if (!isNaN(rate)) {
      CBR_RATE_INPUTS.forEach((id) => {
        const input = document.getElementById(id);
        if (input instanceof HTMLInputElement) input.value = rate.toFixed(1);
      });
    } else {
      throw new Error("Invalid rate value");
    }
  } catch (err) {
    console.error("Failed to fetch CBR rate:", err);
  } finally {
    allBtns.forEach((b) => {
      b.classList.remove("loading");
      b.textContent = "↻";
    });
  }
}
