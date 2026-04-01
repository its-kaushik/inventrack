import { Hono } from 'hono';
import * as dashboardService from '../services/dashboard.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const dashboardRouter = new Hono<AppEnv>();
dashboardRouter.use('*', authMiddleware, tenantScope);

dashboardRouter.get('/', async (c) => {
  const { tenantId, userId, role } = c.get('tenant');
  const data = await dashboardService.getDashboard(tenantId, userId, role);
  return c.json(success(data));
});

export default dashboardRouter;
