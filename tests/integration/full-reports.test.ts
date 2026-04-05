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

const reportEndpoints = [
  { path: '/sales-summary', fields: ['transactionCount', 'revenue', 'cogs', 'grossProfit', 'grossMarginPct'] },
  { path: '/sales-by-category', fields: ['data'] },
  { path: '/sales-by-product', fields: ['data'] },
  { path: '/sales-by-brand', fields: ['data'] },
  { path: '/sales-trend', fields: ['data'] },
  { path: '/profit-margins', fields: ['data'] },
  { path: '/pnl', fields: ['revenue', 'cogs', 'grossProfit', 'totalExpenses', 'netProfit', 'netMarginPct'] },
  { path: '/discount-impact', fields: ['totalMrp', 'totalDiscounts', 'actualRevenue', 'discountPctOfMrp'] },
  { path: '/customer-outstanding', fields: ['data'] },
  { path: '/supplier-outstanding', fields: ['data'] },
  { path: '/credit-aging', fields: ['customers', 'suppliers'] },
  { path: '/payment-collections', fields: ['data'] },
  { path: '/staff-activity', fields: ['billing', 'stock'] },
  { path: '/expense-summary', fields: ['total', 'byCategory'] },
  { path: '/gst-summary', fields: ['gstScheme', 'taxableTurnover', 'totalCgst', 'totalSgst'] },
  { path: '/hsn-summary', fields: ['data'] },
];

describe('Full Reports Suite', () => {
  for (const endpoint of reportEndpoints) {
    it(`GET /reports${endpoint.path} returns 200 with expected fields`, async () => {
      const res = await app.request(`/api/v1/reports${endpoint.path}`, { headers: auth() });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();

      for (const field of endpoint.fields) {
        expect(body.data).toHaveProperty(field);
      }
    });
  }

  it('P&L includes expenses in net profit', async () => {
    const res = await app.request('/api/v1/reports/pnl', { headers: auth() });
    const pnl = (await res.json()).data;
    expect(typeof pnl.totalExpenses).toBe('number');
    expect(pnl.netProfit).toBe(pnl.grossProfit - pnl.totalExpenses);
  });

  it('date range filtering works on sales-summary', async () => {
    const res = await app.request('/api/v1/reports/sales-summary?from=2026-04-01&to=2026-04-30', { headers: auth() });
    expect(res.status).toBe(200);
  });

  it('GST summary shows correct scheme', async () => {
    const res = await app.request('/api/v1/reports/gst-summary', { headers: auth() });
    const data = (await res.json()).data;
    expect(['composite', 'regular']).toContain(data.gstScheme);
  });
});
