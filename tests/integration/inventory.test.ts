import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { productVariants } from '../../src/db/schema/products.js';
import { eq, and } from 'drizzle-orm';

vi.setConfig({ testTimeout: 30_000 });

let ownerToken: string;
let tenantId: string;
let variantId: string;
let variantSku: string;

beforeAll(async () => {
  // Login as existing owner
  const loginRes = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrPhone: 'owner-m3@test.com', password: 'OwnerPass123!' }),
  });
  const loginBody = await loginRes.json();
  ownerToken = loginBody.data.accessToken;

  const meRes = await app.request('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  tenantId = (await meRes.json()).data.tenantId;

  // Get a variant from existing products to test with
  const [variant] = await db
    .select({ id: productVariants.id, sku: productVariants.sku, qty: productVariants.availableQuantity })
    .from(productVariants)
    .where(eq(productVariants.tenantId, tenantId))
    .limit(1);

  if (variant) {
    variantId = variant.id;
    variantSku = variant.sku;
  }
});

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });
const jsonAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` });

describe('Inventory Stock Levels', () => {
  it('lists stock levels with pagination', async () => {
    const res = await app.request('/api/v1/inventory?page=1&limit=10', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.meta.page).toBe(1);
    if (body.data.length > 0) {
      expect(body.data[0].variantId).toBeTruthy();
      expect(body.data[0].productName).toBeTruthy();
      expect(body.data[0].sku).toBeTruthy();
    }
  });
});

describe('Stock Adjustment', () => {
  it('adjusts stock down (damage)', async () => {
    if (!variantId) return; // Skip if no variant

    // Get current stock
    const [before] = await db
      .select({ qty: productVariants.availableQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));

    const res = await app.request('/api/v1/inventory/adjust', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        variantId,
        quantityChange: -1,
        reason: 'damage',
        notes: 'Test damage adjustment',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.adjustment).toBe(-1);
    expect(body.data.newQuantity).toBe(before.qty - 1);
  });

  it('adjusts stock up (count correction)', async () => {
    if (!variantId) return;

    const res = await app.request('/api/v1/inventory/adjust', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        variantId,
        quantityChange: 3,
        reason: 'count_correction',
        notes: 'Found extra stock in back room',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.adjustment).toBe(3);
  });

  it('rejects zero quantity adjustment', async () => {
    const res = await app.request('/api/v1/inventory/adjust', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        variantId: variantId ?? '00000000-0000-0000-0000-000000000000',
        quantityChange: 0,
        reason: 'damage',
        notes: 'test',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects adjustment without notes', async () => {
    const res = await app.request('/api/v1/inventory/adjust', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        variantId: variantId ?? '00000000-0000-0000-0000-000000000000',
        quantityChange: -1,
        reason: 'damage',
        notes: '',
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('Movement History', () => {
  it('returns movement history for a variant', async () => {
    if (!variantId) return;

    const res = await app.request(`/api/v1/inventory/${variantId}/movements`, {
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThanOrEqual(1); // At least the opening_balance + adjustments
    // Verify movement structure
    if (body.data.length > 0) {
      const movement = body.data[0];
      expect(movement.movementType).toBeTruthy();
      expect(movement.quantity).toBeDefined();
      expect(movement.balanceAfter).toBeDefined();
    }
  });
});

describe('Low Stock', () => {
  it('returns low stock items', async () => {
    const res = await app.request('/api/v1/inventory/low-stock', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    // Items returned should all be at or below their threshold
    for (const item of body.data) {
      expect(item.availableQuantity).toBeLessThanOrEqual(item.lowStockThreshold);
    }
  });
});

describe('Shelf Aging', () => {
  it('returns aging items', async () => {
    const res = await app.request('/api/v1/inventory/aging', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Aging query may return empty if no items are old enough
    expect(body.data).toBeDefined();
  });
});

describe('Physical Stock Count', () => {
  it('submits a stock count and reports variance', async () => {
    if (!variantId) return;

    // Get current actual count
    const [current] = await db
      .select({ qty: productVariants.availableQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));

    const res = await app.request('/api/v1/inventory/stock-count', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        counts: [
          { variantId, actualCount: current.qty + 2 }, // Report 2 more than system says
        ],
        autoAdjust: false,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalCounted).toBe(1);
    expect(body.data.discrepancies).toBe(1);
    expect(body.data.items[0].variance).toBe(2);
    expect(body.data.items[0].adjusted).toBe(false);
  });

  it('auto-adjusts stock on count with autoAdjust=true', async () => {
    if (!variantId) return;

    const [before] = await db
      .select({ qty: productVariants.availableQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));

    const targetCount = before.qty + 5; // Report 5 more than system
    const res = await app.request('/api/v1/inventory/stock-count', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        counts: [{ variantId, actualCount: targetCount }],
        autoAdjust: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items[0].variance).toBe(5);
    expect(body.data.items[0].adjusted).toBe(true);

    // Verify stock actually changed
    const [after] = await db
      .select({ qty: productVariants.availableQuantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    expect(after.qty).toBe(targetCount);
  });
});
