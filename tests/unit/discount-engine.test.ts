import { describe, it, expect } from 'vitest';
import { calculateDiscount } from '../../src/lib/discount-engine.js';

describe('Discount Engine', () => {
  it('calculates 3-tier discount correctly (BRD example)', () => {
    const result = calculateDiscount({
      items: [
        { variantId: 'v1', mrp: 800, quantity: 1, productDiscountPct: 0 },
        { variantId: 'v2', mrp: 600, quantity: 1, productDiscountPct: 0 },
        { variantId: 'v3', mrp: 500, quantity: 1, productDiscountPct: 0 },
      ],
      billDiscountPct: 15,
      finalPrice: 1500,
    });

    expect(result.subtotalMrp).toBe(1900);
    expect(result.billDiscountAmount).toBe(285);
    expect(result.subtotalAfterBillDiscount).toBe(1615);
    expect(result.bargainAdjustment).toBe(115);
    expect(result.subtotalTaxable).toBe(1500);
    expect(result.effectiveDiscountPct).toBeCloseTo(21.05, 1);
  });

  it('returns 0% discount when no discounts applied', () => {
    const result = calculateDiscount({
      items: [{ variantId: 'v1', mrp: 1000, quantity: 1, productDiscountPct: 0 }],
      billDiscountPct: 0,
    });
    expect(result.effectiveDiscountPct).toBe(0);
    expect(result.subtotalTaxable).toBe(1000);
  });

  it('handles product-level discount', () => {
    const result = calculateDiscount({
      items: [{ variantId: 'v1', mrp: 1000, quantity: 2, productDiscountPct: 10 }],
      billDiscountPct: 0,
    });
    expect(result.productDiscountTotal).toBe(200);
    expect(result.subtotalTaxable).toBe(1800);
  });

  it('proportionally allocates bill discount for GST', () => {
    const result = calculateDiscount({
      items: [
        { variantId: 'v1', mrp: 600, quantity: 1, productDiscountPct: 0 },
        { variantId: 'v2', mrp: 400, quantity: 1, productDiscountPct: 0 },
      ],
      billDiscountPct: 10,
    });
    expect(result.itemTaxableValues.get('v1')).toBe(540);
    expect(result.itemTaxableValues.get('v2')).toBe(360);
  });

  it('handles bargain adjustment as flat amount', () => {
    const result = calculateDiscount({
      items: [{ variantId: 'v1', mrp: 1000, quantity: 1, productDiscountPct: 0 }],
      billDiscountPct: 15,
      bargainAdjustment: 50,
    });
    expect(result.billDiscountAmount).toBe(150);
    expect(result.bargainAdjustment).toBe(50);
    expect(result.subtotalTaxable).toBe(800);
    expect(result.effectiveDiscountPct).toBe(20);
  });

  it('handles all three tiers together', () => {
    const result = calculateDiscount({
      items: [
        { variantId: 'v1', mrp: 800, quantity: 1, productDiscountPct: 5 },
        { variantId: 'v2', mrp: 1200, quantity: 1, productDiscountPct: 0 },
      ],
      billDiscountPct: 15,
      finalPrice: 1500,
    });
    // MRP total = 2000
    // After product discount: 800*0.95=760 + 1200=1200 = 1960
    // Bill discount: 1960*0.15=294 → 1960-294=1666
    // Bargain: 1666-1500=166
    expect(result.subtotalMrp).toBe(2000);
    expect(result.subtotalTaxable).toBe(1500);
    expect(result.effectiveDiscountPct).toBe(25);
  });

  it('handles zero quantity gracefully', () => {
    const result = calculateDiscount({
      items: [],
      billDiscountPct: 0,
    });
    expect(result.subtotalMrp).toBe(0);
    expect(result.subtotalTaxable).toBe(0);
    expect(result.effectiveDiscountPct).toBe(0);
  });
});
