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

describe('GSTR-1 Export', () => {
  it('returns CSV with correct headers', async () => {
    const res = await app.request('/api/v1/reports/gstr1-export', { headers: auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv');
    expect(res.headers.get('content-disposition')).toContain('gstr1-');

    const csv = await res.text();
    expect(csv).toContain('Invoice Number');
    expect(csv).toContain('Customer GSTIN');
    expect(csv).toContain('Taxable Value');
    expect(csv).toContain('CGST');
    expect(csv).toContain('SGST');
  });

  it('supports date range filtering', async () => {
    const res = await app.request('/api/v1/reports/gstr1-export?from=2026-04-01&to=2026-04-30', { headers: auth() });
    expect(res.status).toBe(200);
  });
});

describe('GSTR-3B Export', () => {
  it('returns CSV with outward/input/net summary', async () => {
    const res = await app.request('/api/v1/reports/gstr3b-export', { headers: auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv');

    const csv = await res.text();
    expect(csv).toContain('Outward Supplies');
    expect(csv).toContain('Input Tax Credit');
    expect(csv).toContain('Net Tax Payable');
  });
});

describe('CMP-08 Export', () => {
  it('returns CSV with turnover and tax calculation', async () => {
    const res = await app.request('/api/v1/reports/cmp08-export', { headers: auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv');

    const csv = await res.text();
    expect(csv).toContain('Total Turnover');
    expect(csv).toContain('Tax Rate');
    expect(csv).toContain('CGST');
    expect(csv).toContain('SGST');
    expect(csv).toContain('Total Tax Payable');
  });
});
