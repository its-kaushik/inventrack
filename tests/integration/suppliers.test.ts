import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';

vi.setConfig({ testTimeout: 15_000 });

let ownerToken: string;
let supplierId: string;

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

describe('Supplier CRUD', () => {
  it('creates a supplier', async () => {
    const res = await app.request('/api/v1/suppliers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        name: `Test Supplier ${Date.now()}`,
        contactPerson: 'Rajesh',
        phone: '9876500001',
        email: 'rajesh@supplier.com',
        gstin: '27AABCU9603R1ZM',
        paymentTerms: 'net_30',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toContain('Test Supplier');
    expect(body.data.paymentTerms).toBe('net_30');
    expect(Number(body.data.outstandingBalance)).toBe(0);
    supplierId = body.data.id;
  });

  it('lists suppliers', async () => {
    const res = await app.request('/api/v1/suppliers', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('searches suppliers by name', async () => {
    const res = await app.request('/api/v1/suppliers?search=Test+Supplier', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('gets supplier by ID', async () => {
    const res = await app.request(`/api/v1/suppliers/${supplierId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(supplierId);
    expect(body.data.gstin).toBe('27AABCU9603R1ZM');
  });

  it('updates a supplier', async () => {
    const res = await app.request(`/api/v1/suppliers/${supplierId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ address: '456 Industrial Area, Delhi' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.address).toBe('456 Industrial Area, Delhi');
  });

  it('returns 404 for non-existent supplier', async () => {
    const res = await app.request('/api/v1/suppliers/00000000-0000-0000-0000-000000000000', {
      headers: auth(),
    });
    expect(res.status).toBe(404);
  });
});

describe('Supplier Payments & Ledger', () => {
  it('records a payment to supplier', async () => {
    const res = await app.request(`/api/v1/suppliers/${supplierId}/payments`, {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        amount: 5000,
        paymentMode: 'bank_transfer',
        notes: 'Advance payment',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.amount).toBe(5000);
    expect(body.data.previousBalance).toBe(0);
    expect(body.data.newBalance).toBe(-5000); // We overpaid (advance)
  });

  it('records another payment', async () => {
    const res = await app.request(`/api/v1/suppliers/${supplierId}/payments`, {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        amount: 3000,
        paymentMode: 'upi',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.newBalance).toBe(-8000);
  });

  it('gets supplier ledger with transaction history', async () => {
    const res = await app.request(`/api/v1/suppliers/${supplierId}/ledger`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBe(2); // Two payments
    // Most recent first
    expect(Number(body.data[0].amount)).toBe(-3000); // Negative = we owe less
    expect(Number(body.data[1].amount)).toBe(-5000);
    expect(body.data[0].type).toBe('payment');
  });

  it('supplier balance reflects payments', async () => {
    const res = await app.request(`/api/v1/suppliers/${supplierId}`, { headers: auth() });
    const body = await res.json();
    expect(Number(body.data.outstandingBalance)).toBe(-8000);
  });

  it('rejects payment with zero amount', async () => {
    const res = await app.request(`/api/v1/suppliers/${supplierId}/payments`, {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ amount: 0, paymentMode: 'cash' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('Supplier Soft Delete', () => {
  it('deactivates (soft deletes) a supplier', async () => {
    const res = await app.request(`/api/v1/suppliers/${supplierId}`, {
      method: 'DELETE',
      headers: auth(),
    });
    expect(res.status).toBe(200);
  });

  it('soft-deleted supplier excluded from list', async () => {
    const res = await app.request('/api/v1/suppliers', { headers: auth() });
    const body = await res.json();
    const ids = body.data.map((s: any) => s.id);
    expect(ids).not.toContain(supplierId);
  });

  it('soft-deleted supplier returns 404 on direct access', async () => {
    const res = await app.request(`/api/v1/suppliers/${supplierId}`, { headers: auth() });
    expect(res.status).toBe(404);
  });
});
