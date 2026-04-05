/** Round to nearest whole rupee (standard Indian retail rounding) */
export function roundToRupee(amount: number): number {
  return Math.round(amount);
}

/** Round to 2 decimal places */
export function roundTo2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Calculate round-off difference */
export function calculateRoundOff(exactTotal: number, roundedTotal: number): number {
  return roundTo2(roundedTotal - exactTotal);
}
