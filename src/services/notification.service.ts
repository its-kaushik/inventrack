import { eq, and, desc, count, sql, isNull, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notifications } from '../db/schema/notifications.js';
import { users } from '../db/schema/users.js';
import { AppError } from '../types/errors.js';
import type { Role } from '../types/enums.js';

type NotificationPriority = 'high' | 'medium' | 'low';

/**
 * Create notifications for all users matching the target roles in a tenant.
 */
export async function notify(
  tenantId: string,
  opts: {
    type: string;
    title: string;
    message: string;
    priority: NotificationPriority;
    data?: Record<string, unknown>;
    targetRoles: Role[];
  },
) {
  // Find all active users with the target roles in this tenant
  const targetUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        isNull(users.deletedAt),
        inArray(users.role, opts.targetRoles),
      ),
    );

  if (targetUsers.length === 0) return;

  // Create one notification per user
  await db.insert(notifications).values(
    targetUsers.map((user) => ({
      tenantId,
      userId: user.id,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      data: opts.data ?? null,
      priority: opts.priority,
    })),
  );
}

/**
 * List notifications for a user, paginated, filtered by read/unread.
 */
export async function listNotifications(
  tenantId: string,
  userId: string,
  opts?: { isRead?: boolean; page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(notifications.tenantId, tenantId),
    eq(notifications.userId, userId),
  ];

  if (opts?.isRead !== undefined) {
    conditions.push(eq(notifications.isRead, opts.isRead));
  }

  const where = and(...conditions);

  const [data, totalResult, unreadResult] = await Promise.all([
    db.select().from(notifications).where(where)
      .orderBy(desc(notifications.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(notifications).where(where),
    db.select({ count: count() }).from(notifications).where(
      and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId), eq(notifications.isRead, false)),
    ),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    unreadCount: unreadResult[0]?.count ?? 0,
    page,
    limit,
  };
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(tenantId: string, userId: string, notificationId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
      ),
    )
    .returning({ id: notifications.id });

  if (!updated) throw new AppError('NOT_FOUND', 'Notification not found', 404);
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(tenantId: string, userId: string) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
      ),
    );
}
