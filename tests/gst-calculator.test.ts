import { describe, it, expect } from 'vitest';
import { backCalculateGst, calculateCompositionTax } from '../src/lib/gst-calculator.js';
import { roundTo2 } from '../src/lib/money.js';

describe('GST Calculator', () => {
  describe('backCalculateGst - Regular scheme', () => {
    it('calculates 5% GST from inclusive price ₹550', () => {
      const result = backCalculateGst(550, 5, 'regular');
      expect(result.taxableValue).toBe(523.81);
      expect(result.totalGst).toBe(26.19);
      expect(result.cgst).toBe(13.10);
      expect(result.sgst).toBe(13.09);
      expect(roundTo2(result.cgst + result.sgst)).toBe(result.totalGst);
    });

    it('calculates 12% GST from inclusive price ₹1120', () => {
      const result = backCalculateGst(1120, 12, 'regular');
      expect(result.taxableValue).toBe(1000);
      expect(result.totalGst).toBe(120);
      expect(result.cgst).toBe(60);
      expect(result.sgst).toBe(60);
    });

    it('handles 0% GST rate', () => {
      const result = backCalculateGst(500, 0, 'regular');
      expect(result.taxableValue).toBe(500);
      expect(result.totalGst).toBe(0);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
    });

    it('handles small amounts without floating-point errors', () => {
      const result = backCalculateGst(105, 5, 'regular');
      expect(result.taxableValue).toBe(100);
      expect(result.totalGst).toBe(5);
      expect(result.cgst).toBe(2.5);
      expect(result.sgst).toBe(2.5);
    });

    it('cgst + sgst always equals totalGst (no penny mismatch)', () => {
      const prices = [99, 150.50, 333, 1750, 2499.99];
      for (const price of prices) {
        const result = backCalculateGst(price, 5, 'regular');
        expect(roundTo2(result.cgst + result.sgst)).toBe(result.totalGst);
      }
    });
  });

  describe('backCalculateGst - Composition scheme', () => {
    it('returns zero GST breakdown', () => {
      const result = backCalculateGst(550, 5, 'composition');
      expect(result.taxableValue).toBe(550);
      expect(result.totalGst).toBe(0);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
    });
  });

  describe('calculateCompositionTax', () => {
    it('calculates 1% of quarterly turnover', () => {
      const result = calculateCompositionTax(1000000);
      expect(result.totalTax).toBe(10000);
      expect(result.cgst).toBe(5000);
      expect(result.sgst).toBe(5000);
    });

    it('handles odd amounts without floating-point errors', () => {
      const result = calculateCompositionTax(333333);
      expect(result.totalTax).toBe(3333.33);
      expect(result.cgst + result.sgst).toBe(result.totalTax);
    });
  });
});
