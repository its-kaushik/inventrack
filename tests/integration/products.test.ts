import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';

// Variant product creation with 8 variants + attributes can be slow on cloud DB
vi.setConfig({ testTimeout: 30_000 });

let ownerToken: string;
let tenantId: string;
let categoryId: string;
let brandId: string;
let simpleProductId: string;
let variantProductId: string;

beforeAll(async () => {
  // Login as existing owner from M3 tests
  const loginRes = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrPhone: 'owner-m3@test.com', password: 'OwnerPass123!' }),
  });
  const body = await loginRes.json();
  ownerToken = body.data.accessToken;
  // Extract tenantId from /auth/me
  const meRes = await app.request('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  tenantId = (await meRes.json()).data.tenantId;
});

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });
const jsonAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` });

describe('Categories', () => {
  it('creates a category', async () => {
    const res = await app.request('/api/v1/products/categories', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ name: "Men's Shirts" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("Men's Shirts");
    categoryId = body.data.id;
  });

  it('creates a sub-category', async () => {
    const res = await app.request('/api/v1/products/categories', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ name: 'Formal Shirts', parentId: categoryId }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).data.parentId).toBe(categoryId);
  });

  it('lists categories', async () => {
    const res = await app.request('/api/v1/products/categories', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('updates a category', async () => {
    const res = await app.request(`/api/v1/products/categories/${categoryId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ name: "Men's Shirts Updated" }),
    });
    expect(res.status).toBe(200);
    // Revert name
    await app.request(`/api/v1/products/categories/${categoryId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ name: "Men's Shirts" }),
    });
  });
});

describe('Brands', () => {
  it('creates a brand', async () => {
    const res = await app.request('/api/v1/products/brands', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ name: `TestBrand-${Date.now()}` }),
    });
    expect(res.status).toBe(201);
    brandId = (await res.json()).data.id;
  });

  it('lists brands', async () => {
    const res = await app.request('/api/v1/products/brands', { headers: auth() });
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBeGreaterThanOrEqual(1);
  });

  it('updates a brand', async () => {
    const uniqueName = `Valbone-${Date.now()}`;
    const res = await app.request(`/api/v1/products/brands/${brandId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ name: uniqueName }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.name).toBe(uniqueName);

    // Revert to original name for subsequent tests
    await app.request(`/api/v1/products/brands/${brandId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ name: 'Valbone' }),
    });
  });
});

describe('Simple Product', () => {
  it('creates a simple product', async () => {
    const res = await app.request('/api/v1/products', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        name: 'Park Avenue Deo 150ml',
        categoryId,
        brandId,
        hasVariants: false,
        costPrice: 120,
        mrp: 250,
        initialQuantity: 10,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('Park Avenue Deo 150ml');
    expect(body.data.hasVariants).toBe(false);
    expect(body.data.variants).toHaveLength(1);
    expect(Number(body.data.variants[0].costPrice)).toBe(120);
    expect(Number(body.data.variants[0].mrp)).toBe(250);
    expect(body.data.variants[0].availableQuantity).toBe(10);
    expect(body.data.variants[0].sku).toBeTruthy();
    expect(body.data.variants[0].barcode).toBeTruthy();
    simpleProductId = body.data.id;
  });

  it('gets product detail with variant', async () => {
    const res = await app.request(`/api/v1/products/${simpleProductId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.variants).toHaveLength(1);
    expect(body.data.variants[0].sku).toBeTruthy();
  });
});

describe('Variant Product', () => {
  it('creates a variant product (4 colors × 2 sizes = 8 variants)', async () => {
    const res = await app.request('/api/v1/products', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        name: 'Valbone Formal Shirt',
        categoryId,
        brandId,
        hsnCode: '6205',
        hasVariants: true,
        variants: [
          { attributes: { Color: 'Blue', Size: '38' }, costPrice: 400, mrp: 800, initialQuantity: 2 },
          { attributes: { Color: 'Blue', Size: '40' }, costPrice: 400, mrp: 800, initialQuantity: 2 },
          { attributes: { Color: 'White', Size: '38' }, costPrice: 400, mrp: 800, initialQuantity: 3 },
          { attributes: { Color: 'White', Size: '40' }, costPrice: 400, mrp: 800, initialQuantity: 3 },
          { attributes: { Color: 'Black', Size: '38' }, costPrice: 420, mrp: 850, initialQuantity: 1 },
          { attributes: { Color: 'Black', Size: '40' }, costPrice: 420, mrp: 850, initialQuantity: 1 },
          { attributes: { Color: 'Grey', Size: '38' }, costPrice: 410, mrp: 820, initialQuantity: 2 },
          { attributes: { Color: 'Grey', Size: '40' }, costPrice: 410, mrp: 820, initialQuantity: 2 },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('Valbone Formal Shirt');
    expect(body.data.hasVariants).toBe(true);
    expect(body.data.variants).toHaveLength(8);

    // Each variant has unique SKU and barcode
    const skus = body.data.variants.map((v: any) => v.sku);
    const barcodes = body.data.variants.map((v: any) => v.barcode);
    expect(new Set(skus).size).toBe(8);
    expect(new Set(barcodes).size).toBe(8);

    // WAC should equal cost price for first purchase
    expect(Number(body.data.variants[0].weightedAvgCost)).toBe(400);

    variantProductId = body.data.id;
  });

  it('gets variant product with attributes', async () => {
    const res = await app.request(`/api/v1/products/${variantProductId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.variants).toHaveLength(8);
    // Each variant should have attributes
    const firstVariant = body.data.variants[0];
    expect(firstVariant.attributes).toBeDefined();
    expect(firstVariant.attributes.Color).toBeTruthy();
    expect(firstVariant.attributes.Size).toBeTruthy();
  });
});

describe('Product List & Search', () => {
  it('lists products with pagination', async () => {
    const res = await app.request('/api/v1/products?page=1&limit=10', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.meta.page).toBe(1);
  });

  it('searches products by name', async () => {
    const res = await app.request('/api/v1/products?search=Valbone', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.some((p: any) => p.name.includes('Valbone'))).toBe(true);
  });

  it('filters products by category', async () => {
    const res = await app.request(`/api/v1/products?categoryId=${categoryId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.every((p: any) => p.categoryId === categoryId)).toBe(true);
  });
});

describe('Product Update & Archive', () => {
  it('updates product name', async () => {
    const res = await app.request(`/api/v1/products/${simpleProductId}`, {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ name: 'Park Avenue Good Morning Deo 150ml' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.name).toBe('Park Avenue Good Morning Deo 150ml');
  });

  it('archives a product and excludes it from isArchived=false list', async () => {
    // Archive
    const archiveRes = await app.request(`/api/v1/products/${simpleProductId}`, {
      method: 'DELETE',
      headers: auth(),
    });
    expect(archiveRes.status).toBe(200);

    // Verify it's archived on the detail
    const detailRes = await app.request(`/api/v1/products/${simpleProductId}`, { headers: auth() });
    expect((await detailRes.json()).data.isArchived).toBe(true);

    // Verify excluded from isArchived=false list
    const listRes = await app.request('/api/v1/products?isArchived=false', { headers: auth() });
    const listBody = await listRes.json();
    const ids = listBody.data.map((p: any) => p.id);
    expect(ids).not.toContain(simpleProductId);
  });

  it('unarchives a product', async () => {
    const res = await app.request(`/api/v1/products/${simpleProductId}/unarchive`, {
      method: 'POST',
      headers: auth(),
    });
    expect(res.status).toBe(200);
  });
});

describe('Create Product with Inline Brand', () => {
  it('creates a product with a new brand inline', async () => {
    const res = await app.request('/api/v1/products', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        name: 'Arrow Slim Fit Jeans',
        categoryId,
        newBrandName: 'Arrow',
        hasVariants: false,
        costPrice: 500,
        mrp: 1200,
        initialQuantity: 5,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.brandId).toBeTruthy();
  });
});
