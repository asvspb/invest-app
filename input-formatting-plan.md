# Investment Amount Input Formatting Plan

## Current State
- Two investment amount input fields exist:
  1. Bank calculator: `#amount`
  2. Retail calculator: `#retail-initial`
- Both use `type="number"`
- Numbers are currently unformatted during input
- Results are already formatted using `formatNumber()` function

## Implementation Plan

### 1. HTML Changes
- Convert input fields from `type="number"` to `type="text"`
- Add pattern attribute to restrict to numbers only
- Remove min attributes as validation will be handled in JavaScript

### 2. JavaScript Enhancements
- Create input formatting handler function
- Add input event listeners to both amount fields
- Strip formatting before calculations
- Handle edge cases (empty input, non-numeric characters)
- Preserve cursor position after formatting

### 3. Integration
- Ensure existing calculation functions work with formatted input
- Maintain all current validation logic
- Keep existing result formatting

## Technical Details
- Use existing `formatNumber()` function as base
- Handle backspace and delete operations properly
- Prevent multiple spaces between numbers
- Allow only numeric input

After implementing these changes, users will see numbers formatted with space separators (e.g., "1 234 567") while typing in the investment amount fields.