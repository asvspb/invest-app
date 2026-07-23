/**
 * @fileoverview Number formatting helpers (pure, no DOM).
 * Ported 1:1 from the original script.js — only TS types added.
 */

/** Format integer with thin spaces as thousands separator. NaN → '0'. */
export function formatNumber(num: number): string {
  return isNaN(num)
    ? "0"
    : Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Format decimal (2 places) with thin spaces as thousands separator. */
export function formatDecimal(num: number): string {
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Parse a user-formatted string ("1 000 000") back to integer; '' or NaN → 0. */
export function parseFormattedNumber(str: string): number {
  return parseInt(str.replace(/\s/g, ""), 10) || 0;
}

/**
 * Format an input field value in-place (thousands separators) and preserve
 * cursor position. Mutates the input; intended for the 'input' event handler.
 */
export function formatInputNumber(input: HTMLInputElement): void {
  const cursorPosition = input.selectionStart;
  const value = input.value.replace(/\s/g, "");

  if (value === "") {
    input.value = "";
    return;
  }

  if (!/^\d+$/.test(value)) {
    input.value = input.value.replace(/[^\d]/g, "");
    return;
  }

  const formatted = formatNumber(parseInt(value, 10));
  input.value = formatted;

  // Restore cursor accounting for inserted spaces.
  if (cursorPosition === null) return;
  const addedSpaces = formatted.length - value.length;
  const newPosition = cursorPosition + addedSpaces;
  input.setSelectionRange(newPosition, newPosition);
}
