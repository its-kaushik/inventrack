import { Hono } from 'hono';
import { z } from 'zod';
import { validate, uuidParam, moneySchema } from '../validators/common.validators.js';
import * as poService from '../services/purchase-order.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const purchaseOrderRoutes = new Hono<AppEnv>();

purchaseOrderRoutes.use('*', authorize('owner', 'manager'));

const createPOSchema = z.object({
  supplierId: z.string().uuid(),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    orderedQuantity: z.number().int().positive(),
    expectedCostPrice: moneySchema,
  })).min(1),
});

const createReturnSchema = z.object({
  supplierId: z.string().uuid(),
  goodsReceiptId: z.string().uuid().optional(),
  reason: z.string().optional(),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive(),
    costPrice: moneySchema,
  })).min(1),
});

// GET /purchase-orders
purchaseOrderRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = c.req.query();
  const result = await poService.listPurchaseOrders(auth.tenantId, {
    supplierId: query.supplierId,
    status: query.status,
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 50,
  });
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) },
  });
});

// POST /purchase-orders
purchaseOrderRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createPOSchema, await c.req.json());
  const po = await poService.createPurchaseOrder(auth.tenantId, auth.userId, body);
  return c.json({ data: po }, 201);
});

// POST /purchase-orders/:id/send
purchaseOrderRoutes.post('/:id/send', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const po = await poService.updatePOStatus(auth.tenantId, id, auth.userId, 'sent');
  return c.json({ data: po });
});

// POST /purchase-orders/:id/cancel
purchaseOrderRoutes.post('/:id/cancel', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const po = await poService.cancelPurchaseOrder(auth.tenantId, id, auth.userId);
  return c.json({ data: po });
});

// GET /purchase-orders/:id
purchaseOrderRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const po = await poService.getPurchaseOrderById(auth.tenantId, id);
  return c.json({ data: po });
});

// PATCH /purchase-orders/:id
purchaseOrderRoutes.patch('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = await c.req.json() as { expectedDate?: string; notes?: string };
  const po = await poService.updatePurchaseOrder(auth.tenantId, id, auth.userId, body);
  return c.json({ data: po });
});

// POST /purchase-returns
purchaseOrderRoutes.post('/returns', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createReturnSchema, await c.req.json());
  const result = await poService.createPurchaseReturn(auth.tenantId, auth.userId, body);
  return c.json({ data: result }, 201);
});
