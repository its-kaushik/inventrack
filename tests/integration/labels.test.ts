import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { productVariants } from '../../src/db/schema/products.js';
import { eq, and, sql } from 'drizzle-orm';
import { generateBarcodeSVG } from '../../src/lib/barcode-generator.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let ownerToken: string;
let tenantId: string;
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

  // Get a variant
  let [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.tenantId, tenantId))
    .limit(1);

  if (!variant) {
    const catRes = await app.request('/api/v1/products/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: `Label Cat ${Date.now()}` }),
    });
    const catId = (await catRes.json()).data.id;

    const prodRes = await app.request('/api/v1/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        name: `Label Product ${Date.now()}`,
        categoryId: catId,
        hasVariants: false,
        costPrice: 200,
        mrp: 500,
        initialQuantity: 5,
      }),
    });
    variant = { id: (await prodRes.json()).data.variants[0].id };
  }
  variantId = variant.id;
});

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });
const jsonAuth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` });

describe('Barcode Generator', () => {
  it('generates valid SVG for a barcode value', () => {
    const svg = generateBarcodeSVG('TEST-123');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg.length).toBeGreaterThan(100);
  });

  it('handles alphanumeric SKU-style values', () => {
    const svg = generateBarcodeSVG('MSHRT-VLB-BLU-40-A1B2');
    expect(svg).toContain('<svg');
  });
});

describe('Label Templates', () => {
  it('returns available label templates', async () => {
    const res = await app.request('/api/v1/labels/templates', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(4);

    const ids = body.data.map((t: any) => t.id);
    expect(ids).toContain('50x25mm');
    expect(ids).toContain('50x30mm');
    expect(ids).toContain('38x25mm');
    expect(ids).toContain('a4-sheet');

    // Each template has required fields
    for (const t of body.data) {
      expect(t.name).toBeTruthy();
      expect(t.widthMm).toBeGreaterThan(0);
      expect(t.heightMm).toBeGreaterThan(0);
    }
  });
});

describe('Label PDF Generation', () => {
  it('generates PDF for thermal label (50x25mm)', async () => {
    const res = await app.request('/api/v1/labels/generate', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        items: [{ variantId, quantity: 3 }],
        templateId: '50x25mm',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('labels-');

    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(100);
    // PDF starts with %PDF
    const header = new Uint8Array(buffer.slice(0, 5));
    expect(String.fromCharCode(...header)).toBe('%PDF-');
  });

  it('generates PDF for A4 sheet', async () => {
    const res = await app.request('/api/v1/labels/generate', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        items: [{ variantId, quantity: 5 }],
        templateId: 'a4-sheet',
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('rejects empty items', async () => {
    const res = await app.request('/api/v1/labels/generate', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({ items: [], templateId: '50x25mm' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent variant', async () => {
    const res = await app.request('/api/v1/labels/generate', {
      method: 'POST',
      headers: jsonAuth(),
      body: JSON.stringify({
        items: [{ variantId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
        templateId: '50x25mm',
      }),
    });
    expect(res.status).toBe(404);
  });
});
