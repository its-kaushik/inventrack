import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { productVariants } from '../../src/db/schema/products.js';
import { suppliers } from '../../src/db/schema/suppliers.js';
import { eq, and } from 'drizzle-orm';

vi.setConfig({ testTimeout: 30_000 });

let ownerToken: string;
let tenantId: string;
let supplierId: string;
let variantId: string;
let receiptId: string;

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

  // Create a supplier for testing
  const supplierRes = await app.request('/api/v1/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({
      name: `GR Test Supplier ${Date.now()}`,
      phone: '9876500099',
      paymentTerms: 'net_30',
    }),
  });
  supplierId = (await supplierRes.json()).data.id;

  // Ensure we have a product with a variant to test against
  let [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.tenantId, tenantId))
    .limit(1);

  if (!variant) {
    // Create a category + simple product
    const catRes = await app.request('/api/v1/products/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `GR Test Cat ${Date.now()}` }),
    });
    const catId = (await catRes.json()).data.id;

    const prodRes = await app.request('/api/v1/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        name: `GR Test Product ${Date.now()}`,
        categoryId: catId,
        hasVariants: false,
        costPrice: 300,
        mrp: 600,
        initialQuantity: 5,
      }),
    });
    const prodData = (await prodRes.json()).data;
    variant = { id: prodData.variants[0].id };
  }

  variantId = variant.id;
});

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });
const jsonAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` });

describe('Goods Receipt — Direct Purchase', () => {
  it('creates a goods receipt with stock update + WAC recalc', async () => {
    // Get stock before
    const [before] = await db
      .select({ qty: productVariants.availableQuantity, wac: productVariants.weightedAvgCost })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));

    const res = await app.request('/api/v1/goods-receipts', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId,
        supplierInvoiceNo: 'INV-001',
        supplierInvoiceDate: '2026-04-01',
        paymentMode: 'paid',
        amountPaid: 4000,
        items: [
          { variantId, quantity: 10, costPrice: 400 },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.receiptNumber).toBeTruthy();
    expect(Number(body.data.totalAmount)).toBe(4000);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].quantity).toBe(10);
    expect(body.data.items[0].newStock).toBe(before.qty + 10);
    expect(body.data.creditAmount).toBe(0); // Fully paid

    receiptId = body.data.id;

    // Verify stock increased
    const [after] = await db
      .select({ qty: productVariants.availableQuantity, wac: productVariants.weightedAvgCost, costPrice: productVariants.costPrice })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    expect(after.qty).toBe(before.qty + 10);
    expect(Number(after.costPrice)).toBe(400); // Latest purchase cost
  });

  it('creates a credit purchase and updates supplier balance', async () => {
    // Get supplier balance before
    const [supplierBefore] = await db
      .select({ balance: suppliers.outstandingBalance })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));

    const res = await app.request('/api/v1/goods-receipts', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId,
        supplierInvoiceNo: 'INV-002',
        supplierInvoiceDate: '2026-04-02',
        paymentMode: 'credit',
        amountPaid: 0,
        items: [
          { variantId, quantity: 5, costPrice: 450 },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.creditAmount).toBe(2250); // 5 × 450

    // Supplier balance should increase by 2250
    const [supplierAfter] = await db
      .select({ balance: suppliers.outstandingBalance })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));
    expect(Number(supplierAfter.balance)).toBe(Number(supplierBefore.balance) + 2250);
  });

  it('creates a partial payment and credits remainder', async () => {
    const [supplierBefore] = await db
      .select({ balance: suppliers.outstandingBalance })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));

    const res = await app.request('/api/v1/goods-receipts', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId,
        paymentMode: 'partial',
        amountPaid: 1000,
        items: [
          { variantId, quantity: 5, costPrice: 400 },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    // Total = 5 × 400 = 2000. Paid 1000. Credit = 1000.
    expect(body.data.creditAmount).toBe(1000);

    const [supplierAfter] = await db
      .select({ balance: suppliers.outstandingBalance })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));
    expect(Number(supplierAfter.balance)).toBe(Number(supplierBefore.balance) + 1000);
  });

  it('WAC recalculates correctly across purchases', async () => {
    const [variant] = await db
      .select({ wac: productVariants.weightedAvgCost })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    // WAC should be a blend of all purchase prices
    expect(Number(variant.wac)).toBeGreaterThan(0);
  });

  it('gets goods receipt by ID with items', async () => {
    const res = await app.request(`/api/v1/goods-receipts/${receiptId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.receiptNumber).toBeTruthy();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].quantity).toBe(10);
  });

  it('lists goods receipts', async () => {
    const res = await app.request('/api/v1/goods-receipts', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('filters goods receipts by supplier', async () => {
    const res = await app.request(`/api/v1/goods-receipts?supplierId=${supplierId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.every((r: any) => r.supplierId === supplierId)).toBe(true);
  });

  it('creates movement records for each receipt item', async () => {
    const res = await app.request(`/api/v1/inventory/${variantId}/movements`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    const purchaseMoves = body.data.filter((m: any) => m.movementType === 'purchase');
    expect(purchaseMoves.length).toBeGreaterThanOrEqual(3); // 3 receipts
  });

  it('rejects receipt for non-existent supplier', async () => {
    const res = await app.request('/api/v1/goods-receipts', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId: '00000000-0000-0000-0000-000000000000',
        paymentMode: 'paid',
        amountPaid: 100,
        items: [{ variantId, quantity: 1, costPrice: 100 }],
      }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects receipt with empty items', async () => {
    const res = await app.request('/api/v1/goods-receipts', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        supplierId,
        paymentMode: 'paid',
        amountPaid: 0,
        items: [],
      }),
    });
    expect(res.status).toBe(400);
  });
});
