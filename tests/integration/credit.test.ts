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

describe('Customer Khata Summary', () => {
  it('returns customer credit summary with aging buckets', async () => {
    const res = await app.request('/api/v1/credit/customers/summary', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.totalReceivable).toBeDefined();
    expect(typeof body.data.totalReceivable).toBe('number');
    expect(body.data.customerCount).toBeDefined();
    expect(typeof body.data.customerCount).toBe('number');
    expect(body.data.customers).toBeInstanceOf(Array);

    // Aging buckets
    expect(body.data.aging).toHaveLength(4);
    expect(body.data.aging[0].range).toBe('0-30 days');
    expect(body.data.aging[1].range).toBe('30-60 days');
    expect(body.data.aging[2].range).toBe('60-90 days');
    expect(body.data.aging[3].range).toBe('90+ days');

    // Each bucket has count and totalAmount
    for (const bucket of body.data.aging) {
      expect(typeof bucket.count).toBe('number');
      expect(typeof bucket.totalAmount).toBe('number');
      expect(bucket.count).toBeGreaterThanOrEqual(0);
    }

    // Bucket counts should sum to total customer count
    const totalBucketCount = body.data.aging.reduce((s: number, b: any) => s + b.count, 0);
    expect(totalBucketCount).toBe(body.data.customerCount);
  });

  it('only shows customers with positive outstanding balance', async () => {
    const res = await app.request('/api/v1/credit/customers/summary', { headers: auth() });
    const body = await res.json();

    for (const customer of body.data.customers) {
      expect(customer.outstandingBalance).toBeGreaterThan(0);
    }
  });

  it('customers sorted by outstanding balance descending', async () => {
    const res = await app.request('/api/v1/credit/customers/summary', { headers: auth() });
    const body = await res.json();

    for (let i = 1; i < body.data.customers.length; i++) {
      expect(body.data.customers[i - 1].outstandingBalance)
        .toBeGreaterThanOrEqual(body.data.customers[i].outstandingBalance);
    }
  });
});

describe('Supplier Payables Summary', () => {
  it('returns supplier payables summary with aging buckets', async () => {
    const res = await app.request('/api/v1/credit/suppliers/summary', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.totalPayable).toBeDefined();
    expect(typeof body.data.totalPayable).toBe('number');
    expect(body.data.supplierCount).toBeDefined();
    expect(body.data.suppliers).toBeInstanceOf(Array);

    // Aging buckets
    expect(body.data.aging).toHaveLength(4);
    expect(body.data.aging[0].range).toBe('0-30 days');
    expect(body.data.aging[3].range).toBe('90+ days');
  });

  it('only shows suppliers with positive outstanding balance', async () => {
    const res = await app.request('/api/v1/credit/suppliers/summary', { headers: auth() });
    const body = await res.json();

    for (const supplier of body.data.suppliers) {
      expect(supplier.outstandingBalance).toBeGreaterThan(0);
    }
  });
});
