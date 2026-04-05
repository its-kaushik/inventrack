import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';

vi.setConfig({ testTimeout: 15_000 });

let ownerToken: string;
let categoryId: string;
let expenseId: string;

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

describe('Expense Categories', () => {
  it('creates an expense category', async () => {
    const res = await app.request('/api/v1/expenses/categories', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ name: `Utilities-${Date.now()}` }),
    });
    expect(res.status).toBe(201);
    categoryId = (await res.json()).data.id;
  });

  it('lists expense categories', async () => {
    const res = await app.request('/api/v1/expenses/categories', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Expenses CRUD', () => {
  it('creates an expense', async () => {
    const res = await app.request('/api/v1/expenses', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        date: '2026-04-05',
        amount: 2500,
        categoryId,
        paymentMode: 'upi',
        notes: 'Electricity bill',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Number(body.data.amount)).toBe(2500);
    expect(body.data.paymentMode).toBe('upi');
    expenseId = body.data.id;
  });

  it('lists expenses with month filter', async () => {
    const res = await app.request('/api/v1/expenses?month=2026-04', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.meta.periodTotal).toBeGreaterThanOrEqual(2500);
  });

  it('gets expense by ID', async () => {
    const res = await app.request(`/api/v1/expenses/${expenseId}`, { headers: auth() });
    expect(res.status).toBe(200);
    expect((await res.json()).data.notes).toBe('Electricity bill');
  });

  it('updates an expense', async () => {
    const res = await app.request(`/api/v1/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ amount: 2800 }),
    });
    expect(res.status).toBe(200);
    expect(Number((await res.json()).data.amount)).toBe(2800);
  });

  it('deletes an expense (soft)', async () => {
    const res = await app.request(`/api/v1/expenses/${expenseId}`, {
      method: 'DELETE',
      headers: auth(),
    });
    expect(res.status).toBe(200);
  });
});

describe('Cash Register', () => {
  it('opens a register', async () => {
    const res = await app.request('/api/v1/cash-register/open', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ openingBalance: 5000 }),
    });
    // May be 201 or 409 if already opened today from a previous test run
    expect([201, 409]).toContain(res.status);
  });

  it('gets current register', async () => {
    const res = await app.request('/api/v1/cash-register/current', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    if (body.data) {
      expect(body.data.status).toBeDefined();
      expect(body.data.openingBalance).toBeDefined();
    }
  });

  it('closes the register', async () => {
    const res = await app.request('/api/v1/cash-register/close', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ actualClosing: 4800 }),
    });
    // May be 200 or 404 if already closed
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.data.status).toBe('closed');
      expect(body.data.discrepancy).toBeDefined();
    }
  });

  it('rejects opening duplicate register', async () => {
    // First ensure register exists by trying to open
    await app.request('/api/v1/cash-register/open', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ openingBalance: 5000 }),
    });
    // Second open should fail
    const res = await app.request('/api/v1/cash-register/open', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ openingBalance: 5000 }),
    });
    expect(res.status).toBe(409);
  });
});
