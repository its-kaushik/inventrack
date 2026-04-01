import { Hono } from 'hono';
import * as stockService from '../services/stock.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const stockRouter = new Hono<AppEnv>();

stockRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

stockRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    categoryId: c.req.query('category_id'),
    status: c.req.query('status') as any,
    limit: Number(c.req.query('limit')) || 20,
    offset: Number(c.req.query('offset')) || 0,
  };
  const data = await stockService.getStockOverview(tenantId, filters);
  return c.json(success(data));
});

stockRouter.get('/:productId', async (c) => {
  const { tenantId } = c.get('tenant');
  const productId = c.req.param('productId')!;
  const data = await stockService.getProductStock(tenantId, productId);
  return c.json(success(data));
});

stockRouter.get('/:productId/history', async (c) => {
  const { tenantId } = c.get('tenant');
  const productId = c.req.param('productId')!;
  const limit = Number(c.req.query('limit')) || 50;
  const offset = Number(c.req.query('offset')) || 0;
  const data = await stockService.getStockHistory(tenantId, productId, limit, offset);
  return c.json(success(data));
});

export default stockRouter;
