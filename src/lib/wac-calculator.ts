/**
 * Weighted Average Cost Calculator.
 * Recalculates WAC on every goods receipt (stock-in from purchase).
 *
 * Formula: new_wac = ((currentQty × currentWAC) + (receivedQty × purchaseCost)) / (currentQty + receivedQty)
 *
 * Edge case: when stock is negative, treat current qty as 0 — WAC resets to purchase cost.
 */
export function calculateWAC(
  currentAvailableQty: number,
  currentWAC: number,
  receivedQty: number,
  purchaseCostPerUnit: number,
): number {
  // When stock is negative, treat as 0 for WAC purposes
  const effectiveCurrentQty = Math.max(currentAvailableQty, 0);
  const effectiveCurrentWAC = effectiveCurrentQty > 0 ? currentWAC : 0;

  const totalCostExisting = effectiveCurrentQty * effectiveCurrentWAC;
  const totalCostNew = receivedQty * purchaseCostPerUnit;
  const totalQty = effectiveCurrentQty + receivedQty;

  if (totalQty === 0) return 0;

  return roundTo2((totalCostExisting + totalCostNew) / totalQty);
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
