import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { notifications } from '../db/schema/notifications.js';
import { NotFoundError } from '../lib/errors.js';

interface CreateNotificationParams {
  tenantId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
}

export async function createNotification(params: CreateNotificationParams) {
  const [notification] = await db
    .insert(notifications)
    .values({
      tenantId: params.tenantId,
      userId: params.userId ?? null,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      data: params.data ?? null,
    })
    .returning();

  return notification;
}

export async function listNotifications(
  tenantId: string,
  userId: string,
  limit?: number,
  offset?: number,
) {
  const effectiveLimit = Math.min(limit || 20, 100);
  const effectiveOffset = offset || 0;

  const items = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        or(eq(notifications.userId, userId), isNull(notifications.userId)),
      ),
    )
    .orderBy(sql`${notifications.createdAt} desc`)
    .limit(effectiveLimit + 1)
    .offset(effectiveOffset);

  const hasMore = items.length > effectiveLimit;
  if (hasMore) items.pop();

  return { items, hasMore };
}

export async function markAsRead(tenantId: string, notificationId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.tenantId, tenantId)))
    .returning();

  if (!updated) throw new NotFoundError('Notification', notificationId);

  return updated;
}

export async function markAllAsRead(tenantId: string, userId: string) {
  const result = await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        or(eq(notifications.userId, userId), isNull(notifications.userId)),
        eq(notifications.isRead, false),
      ),
    )
    .returning({ id: notifications.id });

  return { updated: result.length };
}

export async function getUnreadCount(tenantId: string, userId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        or(eq(notifications.userId, userId), isNull(notifications.userId)),
        eq(notifications.isRead, false),
      ),
    );

  return result?.count ?? 0;
}
