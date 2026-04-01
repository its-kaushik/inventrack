import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function decimalSum<T>(items: T[], fn: (item: T) => Decimal): Decimal {
  return items
    .reduce((acc, item) => acc.plus(fn(item)), new Decimal(0))
    .toDecimalPlaces(2);
}

export function toDbDecimal(d: Decimal): number {
  return d.toDecimalPlaces(2).toNumber();
}

export function roundTo2(n: number): number {
  return new Decimal(n).toDecimalPlaces(2).toNumber();
}

export { Decimal };
