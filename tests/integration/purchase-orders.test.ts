import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { productVariants } from '../../src/db/schema/products.js';
import { suppliers } from '../../src/db/schema/suppliers.js';
import { eq, and, sql } from 'drizzle-orm';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let ownerToken: string;
let tenantId: string;
let supplierId: string;
let variantId: string;
let poId: string;

beforeAll(async () => {
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

  // Create supplier
  const supRes = await app.request('/api/v1/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ name: `PO Supplier ${Date.now()}`, phone: '9876500088', paymentTerms: 'net_30' }),
  });
  supplierId = (await supRes.json()).data.id;

  // Ensure variant
  let [variant] = await db.select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.tenantId, tenantId), sql`${productVariants.availableQuantity} > 0`))
    .limit(1);

  if (!variant) {
    const catRes = await app.request('/api/v1/products/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `PO Cat ${Date.now()}` }),
    });
    const catId = (await catRes.json()).data.id;
    const prodRes = await app.request('/api/v1/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `PO Product ${Date.now()}`, categoryId: catId, hasVariants: false, costPrice: 300, mrp: 600, initialQuantity: 20 }),
    });
    variant = { id: (await prodRes.json()).data.variants[0].id };
  }
  variantId = variant.id;
});

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });
const jsonAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` });

describe('Purchase Order Lifecycle', () => {
  it('creates a PO in draft status', async () => {
    const res = await app.request('/api/v1/purchase-orders', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId,
        expectedDate: '2026-04-15',
        notes: 'Urgent order',
        items: [{ variantId, orderedQuantity: 10, expectedCostPrice: 400 }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.poNumber).toBeTruthy();
    expect(body.data.status).toBe('draft');
    expect(Number(body.data.totalAmount)).toBe(4000);
    poId = body.data.id;
  });

  it('lists POs', async () => {
    const res = await app.request('/api/v1/purchase-orders', { headers: auth() });
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBeGreaterThanOrEqual(1);
  });

  it('gets PO detail with items', async () => {
    const res = await app.request(`/api/v1/purchase-orders/${poId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].orderedQuantity).toBe(10);
    expect(body.data.items[0].receivedQuantity).toBe(0);
  });

  it('updates a draft PO', async () => {
    const res = await app.request(`/api/v1/purchase-orders/${poId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ notes: 'Updated notes' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.notes).toBe('Updated notes');
  });

  it('sends a PO (draft → sent)', async () => {
    const res = await app.request(`/api/v1/purchase-orders/${poId}/send`, {
      method: 'POST',
      headers: auth(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe('sent');
  });

  it('rejects editing a sent PO', async () => {
    const res = await app.request(`/api/v1/purchase-orders/${poId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ notes: 'Cannot edit' }),
    });
    expect(res.status).toBe(409);
  });

  it('receives partial delivery against PO', async () => {
    // Receive 5 of 10 ordered
    const res = await app.request('/api/v1/goods-receipts', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId,
        purchaseOrderId: poId,
        paymentMode: 'credit',
        amountPaid: 0,
        items: [{ variantId, quantity: 5, costPrice: 400 }],
      }),
    });
    expect(res.status).toBe(201);

    // PO should be partially_received
    const poRes = await app.request(`/api/v1/purchase-orders/${poId}`, { headers: auth() });
    const po = (await poRes.json()).data;
    expect(po.status).toBe('partially_received');
    expect(po.items[0].receivedQuantity).toBe(5);
  });

  it('receives remaining delivery (PO fully received)', async () => {
    const res = await app.request('/api/v1/goods-receipts', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId,
        purchaseOrderId: poId,
        paymentMode: 'credit',
        amountPaid: 0,
        items: [{ variantId, quantity: 5, costPrice: 400 }],
      }),
    });
    expect(res.status).toBe(201);

    // PO should be fully_received
    const poRes = await app.request(`/api/v1/purchase-orders/${poId}`, { headers: auth() });
    expect((await poRes.json()).data.status).toBe('fully_received');
  });
});

describe('Purchase Returns', () => {
  it('creates a purchase return (decrements stock + adjusts supplier balance)', async () => {
    const [stockBefore] = await db.select({ qty: productVariants.availableQuantity })
      .from(productVariants).where(eq(productVariants.id, variantId));
    const [supBefore] = await db.select({ balance: suppliers.outstandingBalance })
      .from(suppliers).where(eq(suppliers.id, supplierId));

    const res = await app.request('/api/v1/purchase-orders/returns', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId,
        reason: 'Defective items',
        items: [{ variantId, quantity: 2, costPrice: 400 }],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.returnNumber).toBeTruthy();
    expect(Number(body.data.totalAmount)).toBe(800);

    // Stock decremented
    const [stockAfter] = await db.select({ qty: productVariants.availableQuantity })
      .from(productVariants).where(eq(productVariants.id, variantId));
    expect(stockAfter.qty).toBe(stockBefore.qty - 2);

    // Supplier balance reduced
    const [supAfter] = await db.select({ balance: suppliers.outstandingBalance })
      .from(suppliers).where(eq(suppliers.id, supplierId));
    expect(Number(supAfter.balance)).toBe(Number(supBefore.balance) - 800);
  });
});

describe('PO Cancellation', () => {
  it('cancels a draft PO', async () => {
    // Create a new PO to cancel
    const createRes = await app.request('/api/v1/purchase-orders', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId,
        items: [{ variantId, orderedQuantity: 5, expectedCostPrice: 300 }],
      }),
    });
    const newPoId = (await createRes.json()).data.id;

    const res = await app.request(`/api/v1/purchase-orders/${newPoId}/cancel`, {
      method: 'POST',
      headers: auth(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe('cancelled');
  });

  it('rejects invalid status transition', async () => {
    // Try to send a fully_received PO
    const res = await app.request(`/api/v1/purchase-orders/${poId}/send`, {
      method: 'POST',
      headers: auth(),
    });
    expect(res.status).toBe(409);
  });
});
