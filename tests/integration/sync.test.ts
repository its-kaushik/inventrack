import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { productVariants } from '../../src/db/schema/products.js';
import { eq, and, sql } from 'drizzle-orm';
import { syncConflicts } from '../../src/db/schema/sync.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let ownerToken: string;
let tenantId: string;
let customerId: string;
let variantId: string;

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

  // Create customer for sync tests
  const phone = `95${Date.now().toString().slice(-8)}`;
  const custRes = await app.request('/api/v1/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ name: `Sync Customer ${Date.now()}`, phone }),
  });
  customerId = (await custRes.json()).data.id;

  // Ensure variant with stock
  let [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.tenantId, tenantId), sql`${productVariants.availableQuantity} > 5`))
    .limit(1);

  if (!variant) {
    const catRes = await app.request('/api/v1/products/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Sync Cat ${Date.now()}` }),
    });
    const catId = (await catRes.json()).data.id;

    const prodRes = await app.request('/api/v1/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        name: `Sync Product ${Date.now()}`,
        categoryId: catId,
        hasVariants: false,
        costPrice: 300,
        mrp: 600,
        initialQuantity: 20,
      }),
    });
    variant = { id: (await prodRes.json()).data.variants[0].id };
  }
  variantId = variant.id;
});

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });
const jsonAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` });

describe('Catalog Sync', () => {
  it('returns compact catalog (no images)', async () => {
    const res = await app.request('/api/v1/sync/catalog', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.products).toBeInstanceOf(Array);
    expect(body.data.customers).toBeInstanceOf(Array);
    expect(body.data.settings).toBeDefined();
    expect(body.data.lastSyncedAt).toBeTruthy();

    // Products should have text data fields
    if (body.data.products.length > 0) {
      const p = body.data.products[0];
      expect(p.sku).toBeTruthy();
      expect(p.barcode).toBeTruthy();
      expect(p.mrp).toBeTruthy();
      expect(p.productName).toBeTruthy();
      // Should NOT have image URLs
      expect(p.imageUrl).toBeUndefined();
    }
  });

  it('supports incremental sync with since parameter', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    const res = await app.request(`/api/v1/sync/catalog?since=${pastDate}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should return only items updated after the since date
    expect(body.data.products).toBeInstanceOf(Array);
  });

  it('returns empty for future since date', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await app.request(`/api/v1/sync/catalog?since=${futureDate}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.products).toHaveLength(0);
    expect(body.data.customers).toHaveLength(0);
  });
});

describe('Bill Sync', () => {
  it('syncs an offline bill', async () => {
    const clientId = crypto.randomUUID();
    const [variant] = await db
      .select({ mrp: productVariants.mrp })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));

    const res = await app.request('/api/v1/sync/bills', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        bills: [
          {
            clientId,
            customerId,
            items: [{ variantId, quantity: 1 }],
            billDiscountPct: 0,
            payments: [{ method: 'cash', amount: Number(variant.mrp) }],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.synced).toBe(1);
    expect(body.data.skipped).toBe(0);
    expect(body.data.errors).toBe(0);
    expect(body.data.results[0].status).toBe('synced');
    expect(body.data.results[0].billNumber).toBeTruthy();
  });

  it('skips duplicate client_id (idempotent)', async () => {
    const clientId = crypto.randomUUID();
    const [variant] = await db
      .select({ mrp: productVariants.mrp })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));

    const bill = {
      clientId,
      customerId,
      items: [{ variantId, quantity: 1 }],
      billDiscountPct: 0,
      payments: [{ method: 'cash' as const, amount: Number(variant.mrp) }],
    };

    // First sync
    await app.request('/api/v1/sync/bills', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ bills: [bill] }),
    });

    // Second sync with same client_id — should be skipped
    const res = await app.request('/api/v1/sync/bills', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ bills: [bill] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.skipped).toBe(1);
    expect(body.data.synced).toBe(0);
    expect(body.data.results[0].status).toBe('skipped');
  });

  it('syncs bill with new offline customer', async () => {
    const clientId = crypto.randomUUID();
    const custClientId = crypto.randomUUID();
    const newPhone = `94${Date.now().toString().slice(-8)}`;
    const [variant] = await db
      .select({ mrp: productVariants.mrp })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));

    const res = await app.request('/api/v1/sync/bills', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        bills: [
          {
            clientId,
            customerId: '00000000-0000-0000-0000-000000000000', // placeholder
            newCustomer: { name: 'Offline Customer', phone: newPhone, clientId: custClientId },
            items: [{ variantId, quantity: 1 }],
            billDiscountPct: 0,
            payments: [{ method: 'cash', amount: Number(variant.mrp) }],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.synced).toBe(1);
  });
});

describe('Conflict Management', () => {
  it('lists unresolved conflicts', async () => {
    const res = await app.request('/api/v1/sync/conflicts?status=unresolved', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });

  it('resolves a conflict', async () => {
    // Create a dummy conflict to resolve
    await db.insert(syncConflicts).values({
      tenantId,
      conflictType: 'negative_stock',
      description: 'Test conflict for resolution',
      relatedData: { test: true },
    });

    const conflicts = await db
      .select()
      .from(syncConflicts)
      .where(and(eq(syncConflicts.tenantId, tenantId), eq(syncConflicts.status, 'unresolved')));

    if (conflicts.length > 0) {
      const conflictId = conflicts[0].id;
      const res = await app.request(`/api/v1/sync/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: jsonAuth(),
        body: JSON.stringify({ resolution: 'Acknowledged — stock will be reconciled on next purchase' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('resolved');
      expect(body.data.resolution).toContain('Acknowledged');
    }
  });
});
