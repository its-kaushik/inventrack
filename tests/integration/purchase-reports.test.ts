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

describe('Supplier Purchases Report', () => {
  it('returns purchases grouped by supplier', async () => {
    const res = await app.request('/api/v1/reports/supplier-purchases', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data).toBeInstanceOf(Array);

    for (const item of body.data.data) {
      expect(item.supplierId).toBeTruthy();
      expect(item.supplierName).toBeTruthy();
      expect(typeof item.receiptCount).toBe('number');
      expect(typeof item.totalPurchases).toBe('number');
      expect(typeof item.outstandingBalance).toBe('number');
    }
  });

  it('supports date range filtering', async () => {
    const res = await app.request('/api/v1/reports/supplier-purchases?from=2026-04-01&to=2026-04-30', { headers: auth() });
    expect(res.status).toBe(200);
  });
});

describe('Purchase Summary Report', () => {
  it('returns purchase totals', async () => {
    const res = await app.request('/api/v1/reports/purchase-summary', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(typeof body.data.totalReceipts).toBe('number');
    expect(typeof body.data.totalAmount).toBe('number');
    expect(typeof body.data.totalGst).toBe('number');
    expect(typeof body.data.totalPaid).toBe('number');
    expect(typeof body.data.totalCredit).toBe('number');
  });
});
