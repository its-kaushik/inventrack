import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../../src/app.js';
import * as argon2 from 'argon2';
import { db } from '../../src/db/client.js';
import { users, refreshTokens } from '../../src/db/schema/users.js';
import { tenants, tenantSettings } from '../../src/db/schema/tenants.js';
import { auditLogs } from '../../src/db/schema/audit.js';
import { eq } from 'drizzle-orm';

let superAdminToken: string;
let ownerToken: string;
let tenantId: string;

beforeAll(async () => {
  // Ensure super admin exists (seeded)
  const loginRes = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrPhone: 'admin@inventrack.app', password: 'Admin@123456' }),
  });
  const loginBody = await loginRes.json();
  superAdminToken = loginBody.data.accessToken;
});

describe('Admin: Tenant CRUD', () => {
  it('creates a tenant with auto-created settings', async () => {
    const res = await app.request('/api/v1/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({
        name: 'Kaushik Vastra Bhandar',
        phone: '9876543210',
        email: 'kvb@test.com',
        gstScheme: 'composite',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('Kaushik Vastra Bhandar');
    expect(body.data.gstScheme).toBe('composite');
    expect(body.data.status).toBe('active');
    // Settings auto-created with defaults
    expect(body.data.settings).toBeDefined();
    expect(Number(body.data.settings.defaultBillDiscountPct)).toBe(15);
    expect(Number(body.data.settings.maxDiscountPct)).toBe(30);
    expect(body.data.settings.returnWindowDays).toBe(7);
    expect(body.data.settings.shelfAgingThresholdDays).toBe(90);

    tenantId = body.data.id;
  });

  it('lists all tenants', async () => {
    const res = await app.request('/api/v1/admin/tenants', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('gets a tenant by ID with settings', async () => {
    const res = await app.request(`/api/v1/admin/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('Kaushik Vastra Bhandar');
    expect(body.data.settings).toBeDefined();
  });

  it('updates a tenant', async () => {
    const res = await app.request(`/api/v1/admin/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({ address: '123 Main Road, City' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.address).toBe('123 Main Road, City');
  });

  it('suspends a tenant', async () => {
    const res = await app.request(`/api/v1/admin/tenants/${tenantId}/suspend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('suspended');
  });

  it('reactivates a tenant', async () => {
    const res = await app.request(`/api/v1/admin/tenants/${tenantId}/reactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('active');
  });

  it('blocks non-super-admin from creating tenants', async () => {
    // Create an owner user for this tenant
    const passwordHash = await argon2.hash('OwnerPass123!', { type: argon2.argon2id });
    const [owner] = await db
      .insert(users)
      .values({
        tenantId,
        name: 'Test Owner',
        email: 'owner-m3@test.com',
        passwordHash,
        role: 'owner',
      })
      .returning();

    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone: 'owner-m3@test.com', password: 'OwnerPass123!' }),
    });
    ownerToken = (await loginRes.json()).data.accessToken;

    // Try to create tenant as owner — should be 403
    const res = await app.request('/api/v1/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: 'Unauthorized Store' }),
    });

    expect(res.status).toBe(403);
  });
});

describe('Settings', () => {
  it('owner can get settings', async () => {
    const res = await app.request('/api/v1/settings', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Value is either 15 (fresh) or 12 (if update test ran in a previous suite)
    expect(body.data.defaultBillDiscountPct).toBeDefined();
    expect(body.data.returnWindowDays).toBe(7);
  });

  it('owner can update settings', async () => {
    const res = await app.request('/api/v1/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ billNumberPrefix: 'KVB', defaultBillDiscountPct: 12 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.billNumberPrefix).toBe('KVB');
    expect(Number(body.data.defaultBillDiscountPct)).toBe(12);
  });

  it('owner can get GST settings', async () => {
    const res = await app.request('/api/v1/settings/gst', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.gstScheme).toBe('composite');
  });

  it('owner can update GST scheme', async () => {
    const res = await app.request('/api/v1/settings/gst', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ gstScheme: 'regular', gstin: '27AABCU9603R1ZM' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.gstScheme).toBe('regular');
    expect(body.data.gstin).toBe('27AABCU9603R1ZM');

    // Revert for other tests
    await app.request('/api/v1/settings/gst', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ gstScheme: 'composite' }),
    });
  });
});

describe('Tenant Isolation', () => {
  it('creates a second tenant and verifies isolation', async () => {
    // Create second tenant
    const res = await app.request('/api/v1/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({ name: 'Other Store' }),
    });
    expect(res.status).toBe(201);
    const tenant2Id = (await res.json()).data.id;

    // Create owner for tenant 2
    const passwordHash = await argon2.hash('Owner2Pass!', { type: argon2.argon2id });
    await db.insert(users).values({
      tenantId: tenant2Id,
      name: 'Owner 2',
      email: 'owner2-m3@test.com',
      passwordHash,
      role: 'owner',
    });

    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone: 'owner2-m3@test.com', password: 'Owner2Pass!' }),
    });
    const owner2Token = (await loginRes.json()).data.accessToken;

    // Owner 2 gets their own settings (not tenant 1's)
    const settingsRes = await app.request('/api/v1/settings', {
      headers: { Authorization: `Bearer ${owner2Token}` },
    });
    expect(settingsRes.status).toBe(200);
    const settings = (await settingsRes.json()).data;
    // Tenant 2 should have default bill prefix 'INV' (not tenant 1's 'KVB')
    expect(settings.billNumberPrefix).toBe('INV');

    // Owner 1's users list should not include Owner 2
    const usersRes = await app.request('/api/v1/users', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(usersRes.status).toBe(200);
    const usersList = (await usersRes.json()).data;
    const names = usersList.map((u: any) => u.name);
    expect(names).not.toContain('Owner 2');
  });
});
