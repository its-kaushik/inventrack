import { Hono } from 'hono';
import { validate } from '../validators/common.validators.js';
import {
  adjustStockSchema,
  stockCountSchema,
  movementHistoryQuerySchema,
  inventoryQuerySchema,
} from '../validators/inventory.validators.js';
import * as inventoryService from '../services/inventory.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const inventoryRoutes = new Hono<AppEnv>();

// GET /inventory — stock levels
inventoryRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = validate(inventoryQuerySchema, c.req.query());
  const result = await inventoryService.getStockLevels(auth.tenantId, query);
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) },
  });
});

// POST /inventory/adjust — manual stock adjustment (Owner, Manager only)
inventoryRoutes.post('/adjust', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(adjustStockSchema, await c.req.json());
  const result = await inventoryService.adjustStock(auth.tenantId, auth.userId, body);
  return c.json({ data: result });
});

// GET /inventory/:variantId/movements — stock movement history
inventoryRoutes.get('/:variantId/movements', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const variantId = c.req.param('variantId');
  const query = validate(movementHistoryQuerySchema, c.req.query());
  const result = await inventoryService.getMovementHistory(auth.tenantId, variantId, query);
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

// POST /inventory/stock-count — physical stock count
inventoryRoutes.post('/stock-count', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(stockCountSchema, await c.req.json());
  const result = await inventoryService.submitStockCount(
    auth.tenantId, auth.userId, body.counts, body.autoAdjust,
  );
  return c.json({ data: result });
});

// GET /inventory/low-stock — items below threshold
inventoryRoutes.get('/low-stock', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const items = await inventoryService.getLowStockItems(auth.tenantId);
  return c.json({ data: items });
});

// GET /inventory/aging — items past shelf aging threshold
inventoryRoutes.get('/aging', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const items = await inventoryService.getAgingItems(auth.tenantId);
  return c.json({ data: items });
});
