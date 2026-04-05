import { describe, it, expect, beforeAll, vi } from 'vitest';
import { app } from '../../src/app.js';
import { db } from '../../src/db/client.js';
import { notifications } from '../../src/db/schema/notifications.js';
import { users } from '../../src/db/schema/users.js';
import { eq, and } from 'drizzle-orm';
import { notify } from '../../src/services/notification.service.js';

vi.setConfig({ testTimeout: 15_000 });

let ownerToken: string;
let tenantId: string;
let userId: string;
let notificationId: string;

beforeAll(async () => {
  const loginRes = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrPhone: 'owner-m3@test.com', password: 'OwnerPass123!' }),
  });
  const data = (await loginRes.json()).data;
  ownerToken = data.accessToken;

  const meRes = await app.request('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  const me = (await meRes.json()).data;
  tenantId = me.tenantId;
  userId = me.id;

  // Create test notifications
  await notify(tenantId, {
    type: 'low_stock',
    title: 'Low Stock Alert',
    message: 'Test SKU has only 2 units left',
    priority: 'high',
    data: { sku: 'TEST-001' },
    targetRoles: ['owner'],
  });

  await notify(tenantId, {
    type: 'daily_summary',
    title: 'Daily Summary',
    message: 'Today: 5 transactions, Revenue: ₹12,500',
    priority: 'low',
    targetRoles: ['owner'],
  });
});

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

describe('Notification Service', () => {
  it('creates notifications for target roles', async () => {
    const [count] = await db
      .select({ count: db.$count(notifications) })
      .from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)));
    expect(Number(count.count)).toBeGreaterThanOrEqual(2);
  });
});

describe('Notification Routes', () => {
  it('lists notifications with unread count', async () => {
    const res = await app.request('/api/v1/notifications', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.meta.unreadCount).toBeGreaterThanOrEqual(2);
    expect(body.meta.total).toBeGreaterThanOrEqual(2);

    // Save first notification ID for mark-as-read test
    notificationId = body.data[0].id;
  });

  it('filters unread only', async () => {
    const res = await app.request('/api/v1/notifications?isRead=false', { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const n of body.data) {
      expect(n.isRead).toBe(false);
    }
  });

  it('marks a notification as read', async () => {
    const res = await app.request(`/api/v1/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: auth(),
    });
    expect(res.status).toBe(200);

    // Verify it's read now
    const listRes = await app.request('/api/v1/notifications?isRead=true', { headers: auth() });
    const body = await listRes.json();
    expect(body.data.some((n: any) => n.id === notificationId)).toBe(true);
  });

  it('marks all as read', async () => {
    const res = await app.request('/api/v1/notifications/mark-all-read', {
      method: 'POST',
      headers: auth(),
    });
    expect(res.status).toBe(200);

    // Verify unread count is 0
    const listRes = await app.request('/api/v1/notifications', { headers: auth() });
    const body = await listRes.json();
    expect(body.meta.unreadCount).toBe(0);
  });

  it('returns 404 for non-existent notification', async () => {
    const res = await app.request('/api/v1/notifications/00000000-0000-0000-0000-000000000000/read', {
      method: 'PATCH',
      headers: auth(),
    });
    expect(res.status).toBe(404);
  });
});
