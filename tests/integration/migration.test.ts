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
const jsonAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` });

describe('CSV Templates', () => {
  it('downloads customer import template', async () => {
    const res = await app.request('/api/v1/migration/templates/customers', { headers: auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv');
    const text = await res.text();
    expect(text).toContain('name,phone,outstanding_balance');
  });

  it('downloads supplier import template', async () => {
    const res = await app.request('/api/v1/migration/templates/suppliers', { headers: auth() });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('name,phone,gstin,outstanding_balance');
  });

  it('returns 404 for unknown template type', async () => {
    const res = await app.request('/api/v1/migration/templates/unknown', { headers: auth() });
    expect(res.status).toBe(404);
  });
});

describe('Customer Khata Import', () => {
  it('imports customers with opening balances', async () => {
    const ts = Date.now();
    const csv = `name,phone,outstanding_balance
Customer A ${ts},91${String(ts).slice(-8)},5000
Customer B ${ts},92${String(ts).slice(-8)},2500
Customer C ${ts},93${String(ts).slice(-8)},0`;

    const res = await app.request('/api/v1/migration/customers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ csv }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(3);
    expect(body.data.skipped).toBe(0);
    expect(body.data.errors).toHaveLength(0);
  });

  it('skips duplicate phone numbers', async () => {
    const ts = Date.now();
    const phone = `94${String(ts).slice(-8)}`;
    const csv = `name,phone,outstanding_balance
First Customer,${phone},1000
Duplicate Customer,${phone},2000`;

    const res = await app.request('/api/v1/migration/customers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ csv }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.errors.length).toBe(1);
    expect(body.data.errors[0].reason).toContain('Duplicate phone');
  });

  it('reports errors for invalid rows', async () => {
    const csv = `name,phone,outstanding_balance
,1234567890,1000
Valid Customer,95${Date.now().toString().slice(-8)},500`;

    const res = await app.request('/api/v1/migration/customers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ csv }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(1);
    expect(body.data.errors.length).toBe(1);
    expect(body.data.errors[0].reason).toContain('Name is required');
    expect(body.data.errors[0].row).toBe(2);
  });

  it('rejects missing CSV content', async () => {
    const res = await app.request('/api/v1/migration/customers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('Supplier Balance Import', () => {
  it('imports suppliers with opening balances', async () => {
    const ts = Date.now();
    const csv = `name,phone,gstin,outstanding_balance
Supplier A ${ts},81${String(ts).slice(-8)},27AABCU9603R1ZM,15000
Supplier B ${ts},82${String(ts).slice(-8)},,8000`;

    const res = await app.request('/api/v1/migration/suppliers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ csv }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(2);
    expect(body.data.errors).toHaveLength(0);
  });
});
