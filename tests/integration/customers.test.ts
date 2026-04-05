import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';

vi.setConfig({ testTimeout: 15_000 });

let ownerToken: string;
let customerId: string;
const testPhone = `99${Date.now().toString().slice(-8)}`;

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

describe('Customer CRUD', () => {
  it('creates a customer', async () => {
    const res = await app.request('/api/v1/customers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        name: 'Rahul Sharma',
        phone: testPhone,
        email: 'rahul@test.com',
        address: '456 MG Road',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('Rahul Sharma');
    expect(body.data.phone).toBe(testPhone);
    expect(Number(body.data.outstandingBalance)).toBe(0);
    expect(body.data.visitCount).toBe(0);
    customerId = body.data.id;
  });

  it('rejects duplicate phone number', async () => {
    const res = await app.request('/api/v1/customers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ name: 'Another Person', phone: testPhone }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('CONFLICT');
  });

  it('lists customers', async () => {
    const res = await app.request('/api/v1/customers', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('searches customers by name', async () => {
    const res = await app.request('/api/v1/customers?search=Rahul', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some((c: any) => c.name === 'Rahul Sharma')).toBe(true);
  });

  it('searches customers by phone', async () => {
    const res = await app.request(`/api/v1/customers?search=${testPhone}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('gets customer by ID', async () => {
    const res = await app.request(`/api/v1/customers/${customerId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Rahul Sharma');
    expect(body.data.email).toBe('rahul@test.com');
  });

  it('updates a customer', async () => {
    const res = await app.request(`/api/v1/customers/${customerId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ address: '789 New Road, Updated' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.address).toBe('789 New Road, Updated');
  });

  it('returns 404 for non-existent customer', async () => {
    const res = await app.request('/api/v1/customers/00000000-0000-0000-0000-000000000000', {
      headers: auth(),
    });
    expect(res.status).toBe(404);
  });
});

describe('Customer Payments & Ledger', () => {
  it('records a payment from customer', async () => {
    const res = await app.request(`/api/v1/customers/${customerId}/payments`, {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        amount: 2000,
        paymentMode: 'cash',
        notes: 'Partial payment on khata',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.amount).toBe(2000);
    expect(body.data.previousBalance).toBe(0);
    expect(body.data.newBalance).toBe(-2000); // Overpayment (advance)
  });

  it('gets customer ledger', async () => {
    const res = await app.request(`/api/v1/customers/${customerId}/ledger`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].type).toBe('payment');
    expect(Number(body.data[0].amount)).toBe(-2000);
  });

  it('customer balance reflects payment', async () => {
    const res = await app.request(`/api/v1/customers/${customerId}`, { headers: auth() });
    const body = await res.json();
    expect(Number(body.data.outstandingBalance)).toBe(-2000);
  });

  it('rejects zero amount payment', async () => {
    const res = await app.request(`/api/v1/customers/${customerId}/payments`, {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ amount: 0, paymentMode: 'cash' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('Client ID Idempotency', () => {
  it('returns existing customer when creating with same client_id', async () => {
    const clientId = crypto.randomUUID();
    const phone2 = `98${Date.now().toString().slice(-8)}`;

    // First create
    const res1 = await app.request('/api/v1/customers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ name: 'Idempotent Customer', phone: phone2, clientId }),
    });
    expect(res1.status).toBe(201);
    const id1 = (await res1.json()).data.id;

    // Second create with same client_id but different phone — returns existing
    const res2 = await app.request('/api/v1/customers', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ name: 'Different Name', phone: '9999900099', clientId }),
    });
    expect(res2.status).toBe(201);
    const id2 = (await res2.json()).data.id;

    expect(id1).toBe(id2); // Same customer returned
  });
});
