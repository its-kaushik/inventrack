import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';

vi.setConfig({ testTimeout: 15_000 });

let ownerToken: string;

beforeAll(async () => {
  const loginRes = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrPhone: 'owner-m3@test.com', password: 'OwnerPass123!' }),
  });
  ownerToken = (await loginRes.json()).data.accessToken;
});

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

describe('Current Stock Report', () => {
  it('returns stock levels with computed values', async () => {
    const res = await app.request('/api/v1/reports/current-stock', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.meta.total).toBeGreaterThanOrEqual(0);

    if (body.data.length > 0) {
      const item = body.data[0];
      expect(item.variantId).toBeTruthy();
      expect(item.productName).toBeTruthy();
      expect(item.sku).toBeTruthy();
      expect(typeof item.availableQuantity).toBe('number');
      expect(typeof item.stockValueAtCost).toBe('number');
      expect(typeof item.stockValueAtMrp).toBe('number');
    }
  });
});

describe('Inventory Valuation', () => {
  it('returns total valuation at cost and MRP', async () => {
    const res = await app.request('/api/v1/reports/inventory-valuation', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.data.totalVariants).toBe('number');
    expect(typeof body.data.totalUnits).toBe('number');
    expect(typeof body.data.valueAtCost).toBe('number');
    expect(typeof body.data.valueAtMrp).toBe('number');
    expect(body.data.valueAtMrp).toBeGreaterThanOrEqual(body.data.valueAtCost);
  });
});

describe('Dead Stock Report', () => {
  it('returns items past aging threshold', async () => {
    const res = await app.request('/api/v1/reports/dead-stock', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.data.thresholdDays).toBe('number');
    expect(body.data.items).toBeInstanceOf(Array);

    for (const item of body.data.items) {
      expect(item.ageDays).toBeGreaterThanOrEqual(body.data.thresholdDays);
      expect(typeof item.capitalLocked).toBe('number');
    }
  });
});

describe('Low Stock Report', () => {
  it('returns items below threshold', async () => {
    const res = await app.request('/api/v1/reports/low-stock', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data).toBeInstanceOf(Array);
    expect(typeof body.data.count).toBe('number');

    for (const item of body.data.data) {
      expect(item.availableQuantity).toBeLessThanOrEqual(item.lowStockThreshold);
    }
  });
});
