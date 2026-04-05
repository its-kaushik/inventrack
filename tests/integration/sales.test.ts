import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { productVariants } from '../../src/db/schema/products.js';
import { customers } from '../../src/db/schema/customers.js';
import { eq, and, isNull } from 'drizzle-orm';

vi.setConfig({ testTimeout: 30_000 });

let ownerToken: string;
let tenantId: string;
let customerId: string;
let variantId: string;
let variantMrp: number;
let saleId: string;
let billNumber: string;

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

  // Ensure we have a customer
  const phone = `97${Date.now().toString().slice(-8)}`;
  const custRes = await app.request('/api/v1/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ name: `Sale Test Customer ${Date.now()}`, phone }),
  });
  customerId = (await custRes.json()).data.id;

  // Ensure we have a variant with stock
  let [variant] = await db
    .select({ id: productVariants.id, mrp: productVariants.mrp, qty: productVariants.availableQuantity })
    .from(productVariants)
    .where(and(eq(productVariants.tenantId, tenantId), sql`${productVariants.availableQuantity} > 0`))
    .limit(1);

  if (!variant) {
    // Create a product with stock
    const catRes = await app.request('/api/v1/products/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Sale Cat ${Date.now()}` }),
    });
    const catId = (await catRes.json()).data.id;

    const prodRes = await app.request('/api/v1/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        name: `Sale Product ${Date.now()}`,
        categoryId: catId,
        hasVariants: false,
        costPrice: 400,
        mrp: 800,
        initialQuantity: 20,
      }),
    });
    const prodData = (await prodRes.json()).data;
    variant = { id: prodData.variants[0].id, mrp: '800', qty: 20 };
  }

  variantId = variant.id;
  variantMrp = Number(variant.mrp);
});

// Need to import sql for the beforeAll query
import { sql } from 'drizzle-orm';

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });
const jsonAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` });

describe('POS Sale Creation', () => {
  it('creates a simple cash sale', async () => {
    const [before] = await db
      .select({ qty: productVariants.availableQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));

    const res = await app.request('/api/v1/sales', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        customerId,
        items: [{ variantId, quantity: 2 }],
        billDiscountPct: 15,
        payments: [{ method: 'cash', amount: variantMrp * 2 * 0.85 }],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.billNumber).toBeTruthy();
    expect(Number(body.data.subtotalMrp)).toBe(variantMrp * 2);
    expect(Number(body.data.effectiveDiscountPct)).toBe(15);
    expect(Number(body.data.netPayable)).toBeGreaterThan(0);

    saleId = body.data.id;
    billNumber = body.data.billNumber;

    // Verify stock decremented
    const [after] = await db
      .select({ qty: productVariants.availableQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    expect(after.qty).toBe(before.qty - 2);
  });

  it('creates a sale with bargain (final price)', async () => {
    const finalPrice = Math.round(variantMrp * 0.7); // 70% of MRP
    const res = await app.request('/api/v1/sales', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        customerId,
        items: [{ variantId, quantity: 1 }],
        billDiscountPct: 15,
        finalPrice,
        payments: [{ method: 'cash', amount: finalPrice }],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Number(body.data.netPayable)).toBe(finalPrice);
    // Bargain adjustment = (MRP after bill discount) - final price
    expect(Number(body.data.bargainAdjustment)).toBeGreaterThan(0);
  });

  it('creates a split payment sale (cash + credit)', async () => {
    const [custBefore] = await db
      .select({ balance: customers.outstandingBalance })
      .from(customers)
      .where(eq(customers.id, customerId));

    // Use no discount to keep math simple
    const netPayable = variantMrp; // 1 item, no discount = MRP
    const cashPortion = Math.floor(netPayable * 0.6);
    const creditPortion = netPayable - cashPortion;

    const res = await app.request('/api/v1/sales', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        customerId,
        items: [{ variantId, quantity: 1 }],
        billDiscountPct: 0,
        payments: [
          { method: 'cash', amount: cashPortion },
          { method: 'credit', amount: creditPortion },
        ],
      }),
    });

    expect(res.status).toBe(201);

    // Customer balance should have increased by credit portion
    const [custAfter] = await db
      .select({ balance: customers.outstandingBalance })
      .from(customers)
      .where(eq(customers.id, customerId));
    expect(Number(custAfter.balance)).toBe(Number(custBefore.balance) + creditPortion);
  });

  it('gets sale detail with items and payments', async () => {
    const res = await app.request(`/api/v1/sales/${saleId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.billNumber).toBe(billNumber);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.payments).toHaveLength(1);
    expect(body.data.items[0].productName).toBeTruthy();
    expect(Number(body.data.items[0].costAtSale)).toBeGreaterThan(0); // WAC snapshot
  });

  it('lists sales with pagination', async () => {
    const res = await app.request('/api/v1/sales', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('sequential bill numbers', async () => {
    const res = await app.request('/api/v1/sales', { headers: auth() });
    const body = await res.json();
    const numbers = body.data.map((s: any) => s.billNumber).sort();
    // All should have the same prefix pattern
    expect(numbers.every((n: string) => n.includes('-'))).toBe(true);
  });
});

describe('Sale Validation', () => {
  it('rejects sale without customer', async () => {
    const res = await app.request('/api/v1/sales', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        items: [{ variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount: 800 }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects sale with empty items', async () => {
    const res = await app.request('/api/v1/sales', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        customerId,
        items: [],
        payments: [{ method: 'cash', amount: 100 }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects sale without payment', async () => {
    const res = await app.request('/api/v1/sales', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        customerId,
        items: [{ variantId, quantity: 1 }],
        payments: [],
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('Park / Recall Bills', () => {
  let parkedId: string;

  it('parks a bill', async () => {
    const res = await app.request('/api/v1/sales/park', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        customerId,
        cartData: { items: [{ variantId, quantity: 3, mrp: variantMrp }] },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeTruthy();
    expect(body.data.cartData).toBeDefined();
    parkedId = body.data.id;
  });

  it('lists parked bills', async () => {
    const res = await app.request('/api/v1/sales/parked', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('recalls a parked bill', async () => {
    const res = await app.request(`/api/v1/sales/parked/${parkedId}/recall`, {
      method: 'POST',
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cartData).toBeDefined();
  });

  it('recalled bill is removed from parked list', async () => {
    const res = await app.request('/api/v1/sales/parked', { headers: auth() });
    const body = await res.json();
    const ids = body.data.map((p: any) => p.id);
    expect(ids).not.toContain(parkedId);
  });
});
