import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { productVariants } from '../../src/db/schema/products.js';
import { customers } from '../../src/db/schema/customers.js';
import { sql, eq, and } from 'drizzle-orm';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let ownerToken: string;
let tenantId: string;
let customerId: string;
let variantId: string;
let variantMrp: number;
let saleId: string;
let approvalToken: string;

beforeAll(async () => {
  // Login as owner
  const loginRes = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrPhone: 'owner-m3@test.com', password: 'OwnerPass123!' }),
  });
  ownerToken = (await loginRes.json()).data.accessToken;

  const meRes = await app.request('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  tenantId = (await meRes.json()).data.tenantId;

  // Create customer
  const phone = `96${Date.now().toString().slice(-8)}`;
  const custRes = await app.request('/api/v1/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ name: `Void Test Customer ${Date.now()}`, phone }),
  });
  customerId = (await custRes.json()).data.id;

  // Ensure variant with stock
  let [variant] = await db
    .select({ id: productVariants.id, mrp: productVariants.mrp, qty: productVariants.availableQuantity })
    .from(productVariants)
    .where(and(eq(productVariants.tenantId, tenantId), sql`${productVariants.availableQuantity} > 5`))
    .limit(1);

  if (!variant) {
    const catRes = await app.request('/api/v1/products/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Void Cat ${Date.now()}` }),
    });
    const catId = (await catRes.json()).data.id;

    const prodRes = await app.request('/api/v1/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        name: `Void Product ${Date.now()}`,
        categoryId: catId,
        hasVariants: false,
        costPrice: 400,
        mrp: 800,
        initialQuantity: 20,
      }),
    });
    variant = { id: (await prodRes.json()).data.variants[0].id, mrp: '800', qty: 20 };
  }

  variantId = variant.id;
  variantMrp = Number(variant.mrp);

  // Set Owner PIN (needed for approval token)
  await app.request('/api/v1/auth/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ newPin: '1234' }),
  });

  // Get approval token
  const pinRes = await app.request('/api/v1/auth/pin/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ pin: '1234', action: 'void' }),
  });
  approvalToken = (await pinRes.json()).data.approvalToken;

  // Create a sale to void
  const saleRes = await app.request('/api/v1/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({
      customerId,
      items: [{ variantId, quantity: 2 }],
      billDiscountPct: 0,
      payments: [
        { method: 'cash', amount: variantMrp },
        { method: 'credit', amount: variantMrp },
      ],
    }),
  });
  saleId = (await saleRes.json()).data.id;
});

const jsonAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` });

describe('Bill Void', () => {
  it('voids a sale within window with valid approval token', async () => {
    // Get stock + customer balance before void
    const [stockBefore] = await db
      .select({ qty: productVariants.availableQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));

    const [custBefore] = await db
      .select({ balance: customers.outstandingBalance })
      .from(customers)
      .where(eq(customers.id, customerId));

    const res = await app.request(`/api/v1/sales/${saleId}/void`, {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ reason: 'Wrong customer selected', approvalToken }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('cancelled');
    expect(body.data.voidReason).toBe('Wrong customer selected');
    expect(body.data.voidedAt).toBeTruthy();

    // Stock should be restored (+2)
    const [stockAfter] = await db
      .select({ qty: productVariants.availableQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    expect(stockAfter.qty).toBe(stockBefore.qty + 2);

    // Customer credit balance should be reversed
    const [custAfter] = await db
      .select({ balance: customers.outstandingBalance })
      .from(customers)
      .where(eq(customers.id, customerId));
    expect(Number(custAfter.balance)).toBe(Number(custBefore.balance) - variantMrp);
  });

  it('rejects void without approval token', async () => {
    const res = await app.request(`/api/v1/sales/${saleId}/void`, {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ reason: 'test' }),
    });
    expect(res.status).toBe(400); // Validation error — missing approvalToken
  });

  it('rejects void of already cancelled sale', async () => {
    const res = await app.request(`/api/v1/sales/${saleId}/void`, {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ reason: 'test', approvalToken }),
    });
    expect(res.status).toBe(409); // Already cancelled
  });

  it('voided sale shows cancelled status in detail', async () => {
    const res = await app.request(`/api/v1/sales/${saleId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('cancelled');
    expect(body.data.voidReason).toBe('Wrong customer selected');
  });
});
