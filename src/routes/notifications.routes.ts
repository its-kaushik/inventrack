import { Hono } from 'hono';
import * as notificationService from '../services/notification.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { success, paginated } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const notificationsRouter = new Hono<AppEnv>();

notificationsRouter.use('*', authMiddleware, tenantScope);

notificationsRouter.get('/unread-count', async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const count = await notificationService.getUnreadCount(tenantId, userId);
  return c.json(success({ count }));
});

notificationsRouter.patch('/read-all', async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const result = await notificationService.markAllAsRead(tenantId, userId);
  return c.json(success(result));
});

notificationsRouter.get('/', async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const limit = Number(c.req.query('limit')) || 20;
  const offset = Number(c.req.query('offset')) || 0;
  const result = await notificationService.listNotifications(tenantId, userId, limit, offset);
  return c.json(paginated(result.items, result.hasMore ? 'next' : null, result.hasMore));
});

notificationsRouter.patch('/:id/read', async (c) => {
  const { tenantId } = c.get('tenant');
  const notificationId = c.req.param('id')!;
  const notification = await notificationService.markAsRead(tenantId, notificationId);
  return c.json(success(notification));
});

export default notificationsRouter;
