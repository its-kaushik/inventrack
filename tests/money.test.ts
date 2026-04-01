import { describe, it, expect } from 'vitest';
import { Decimal, decimalSum, toDbDecimal, roundTo2 } from '../src/lib/money.js';

describe('Money utilities', () => {
  describe('decimalSum', () => {
    it('sums an array using decimal.js (no float errors)', () => {
      const items = [
        { amount: 0.1 },
        { amount: 0.2 },
        { amount: 0.3 },
      ];
      const result = decimalSum(items, (i) => new Decimal(i.amount));
      expect(result.toNumber()).toBe(0.6);
    });

    it('returns 0 for empty array', () => {
      const result = decimalSum([], () => new Decimal(0));
      expect(result.toNumber()).toBe(0);
    });

    it('handles large Indian retail amounts', () => {
      const items = [
        { price: 1234.50, qty: 3 },
        { price: 5678.75, qty: 2 },
      ];
      const result = decimalSum(items, (i) => new Decimal(i.price).times(i.qty));
      expect(result.toNumber()).toBe(15061);
    });
  });

  describe('toDbDecimal', () => {
    it('rounds to 2 decimal places', () => {
      expect(toDbDecimal(new Decimal(10.456))).toBe(10.46);
      expect(toDbDecimal(new Decimal(10.454))).toBe(10.45);
      expect(toDbDecimal(new Decimal(10.455))).toBe(10.46); // ROUND_HALF_UP
    });
  });

  describe('roundTo2', () => {
    it('rounds native number to 2 decimals via Decimal', () => {
      expect(roundTo2(0.1 + 0.2)).toBe(0.3);
      expect(roundTo2(1.005)).toBe(1.01); // ROUND_HALF_UP
    });
  });
});
