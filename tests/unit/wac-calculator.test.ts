import { describe, it, expect } from 'vitest';
import { calculateWAC } from '../../src/lib/wac-calculator.js';

describe('WAC Calculator', () => {
  it('calculates WAC for first purchase (no existing stock)', () => {
    const wac = calculateWAC(0, 0, 10, 400);
    expect(wac).toBe(400);
  });

  it('calculates WAC for second purchase at different price', () => {
    // 10 units at 400, then 5 units at 450
    // WAC = (10*400 + 5*450) / 15 = (4000 + 2250) / 15 = 416.67
    const wac = calculateWAC(10, 400, 5, 450);
    expect(wac).toBe(416.67);
  });

  it('calculates WAC for same price purchase', () => {
    const wac = calculateWAC(10, 400, 10, 400);
    expect(wac).toBe(400);
  });

  it('handles negative stock — treats current qty as 0, WAC resets to purchase cost', () => {
    // Stock is -2, new purchase of 10 at 450
    // Effective current qty = 0, so WAC = 450
    const wac = calculateWAC(-2, 400, 10, 450);
    expect(wac).toBe(450);
  });

  it('handles zero received quantity', () => {
    const wac = calculateWAC(10, 400, 0, 0);
    // totalQty = 10 + 0 = 10, WAC stays the same
    expect(wac).toBe(400);
  });

  it('returns 0 when both current and received are 0', () => {
    const wac = calculateWAC(0, 0, 0, 0);
    expect(wac).toBe(0);
  });

  it('handles large quantities accurately', () => {
    // 1000 units at 399.50, then 500 units at 425.75
    // WAC = (1000*399.50 + 500*425.75) / 1500 = (399500 + 212875) / 1500 = 408.25
    const wac = calculateWAC(1000, 399.50, 500, 425.75);
    expect(wac).toBe(408.25);
  });

  it('handles very small quantities', () => {
    const wac = calculateWAC(1, 100, 1, 200);
    expect(wac).toBe(150);
  });

  it('handles negative stock with large deficit', () => {
    // Stock is -100, buy 50 at 500
    // Effective current = 0, WAC resets to 500
    const wac = calculateWAC(-100, 300, 50, 500);
    expect(wac).toBe(500);
  });

  it('progressive WAC through multiple purchases', () => {
    // Purchase 1: 10 @ 400 → WAC = 400
    let wac = calculateWAC(0, 0, 10, 400);
    expect(wac).toBe(400);

    // Purchase 2: 5 @ 450 → WAC = 416.67
    wac = calculateWAC(10, wac, 5, 450);
    expect(wac).toBe(416.67);

    // Sell 8 (stock goes from 15 to 7) — WAC doesn't change on sale
    // Purchase 3: 3 @ 420 → WAC = (7*416.67 + 3*420) / 10 = (2916.69 + 1260) / 10 = 417.67
    wac = calculateWAC(7, 416.67, 3, 420);
    expect(wac).toBe(417.67);
  });
});
