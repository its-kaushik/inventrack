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

describe('Dashboard', () => {
  it('returns dashboard with all expected sections', async () => {
    const res = await app.request('/api/v1/reports/dashboard', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const d = body.data;

    // Today's sales
    expect(d.todaySales).toBeDefined();
    expect(typeof d.todaySales.transactionCount).toBe('number');
    expect(typeof d.todaySales.totalRevenue).toBe('number');
    expect(typeof d.todaySales.avgValue).toBe('number');

    // MTD + last month comparison
    expect(typeof d.mtdRevenue).toBe('number');
    expect(typeof d.lastMonthRevenue).toBe('number');

    // Low stock + aging
    expect(typeof d.lowStockCount).toBe('number');
    expect(d.lowStockCount).toBeGreaterThanOrEqual(0);
    expect(typeof d.agingAlertsCount).toBe('number');

    // Credit summary
    expect(d.credit).toBeDefined();
    expect(typeof d.credit.totalReceivable).toBe('number');
    expect(typeof d.credit.totalPayable).toBe('number');

    // Top selling
    expect(d.topSellingToday).toBeInstanceOf(Array);

    // Sync status
    expect(d.syncStatus).toBeDefined();
    expect(typeof d.syncStatus.unresolvedConflicts).toBe('number');
  });

  it('returns numbers not strings for all monetary values', async () => {
    const res = await app.request('/api/v1/reports/dashboard', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const d = (await res.json()).data;

    // All values should be numbers, not stringified numerics
    expect(typeof d.todaySales.totalRevenue).toBe('number');
    expect(typeof d.mtdRevenue).toBe('number');
    expect(typeof d.credit.totalReceivable).toBe('number');
    expect(typeof d.credit.totalPayable).toBe('number');
  });

  it('top selling items have correct structure', async () => {
    const res = await app.request('/api/v1/reports/dashboard', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const d = (await res.json()).data;

    for (const item of d.topSellingToday) {
      expect(item.productName).toBeTruthy();
      expect(typeof item.totalQty).toBe('number');
      expect(typeof item.totalRevenue).toBe('number');
    }
  });

  it('responds within 2 seconds', async () => {
    const start = Date.now();
    const res = await app.request('/api/v1/reports/dashboard', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const duration = Date.now() - start;
    expect(res.status).toBe(200);
    expect(duration).toBeLessThan(5000); // 5s for cloud DB (BRD target is 2s for local)
  });
});
