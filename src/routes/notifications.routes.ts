import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import * as notificationService from '../services/notification.service.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const notificationRoutes = new Hono<AppEnv>();

// GET /notifications — list for current user
notificationRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = c.req.query();
  const isRead = query.isRead === 'true' ? true : query.isRead === 'false' ? false : undefined;
  const result = await notificationService.listNotifications(auth.tenantId, auth.userId, {
    isRead,
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 50,
  });
  return c.json({
    data: result.data,
    meta: { total: result.total, unreadCount: result.unreadCount, page: result.page, limit: result.limit },
  });
});

// PATCH /notifications/:id/read — mark as read
notificationRoutes.patch('/:id/read', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  await notificationService.markAsRead(auth.tenantId, auth.userId, id);
  return c.json({ data: { message: 'Marked as read' } });
});

// POST /notifications/mark-all-read — mark all as read
notificationRoutes.post('/mark-all-read', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  await notificationService.markAllAsRead(auth.tenantId, auth.userId);
  return c.json({ data: { message: 'All notifications marked as read' } });
});
