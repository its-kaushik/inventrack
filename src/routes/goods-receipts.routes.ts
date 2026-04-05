import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import { createGoodsReceiptSchema } from '../validators/purchase.validators.js';
import * as goodsReceiptService from '../services/goods-receipt.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const goodsReceiptRoutes = new Hono<AppEnv>();

// POST /goods-receipts — all roles can add stock (per BRD: salesman can add stock)
goodsReceiptRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createGoodsReceiptSchema, await c.req.json());
  const receipt = await goodsReceiptService.createGoodsReceipt(auth.tenantId, auth.userId, body);
  return c.json({ data: receipt }, 201);
});

// GET /goods-receipts/:id — Owner, Manager
goodsReceiptRoutes.get('/:id', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const receipt = await goodsReceiptService.getGoodsReceiptById(auth.tenantId, id);
  return c.json({ data: receipt });
});

// GET /goods-receipts — list
goodsReceiptRoutes.get('/', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = c.req.query();
  const result = await goodsReceiptService.listGoodsReceipts(auth.tenantId, {
    supplierId: query.supplierId,
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 50,
  });
  return c.json({ data: result.data, meta: { page: result.page, limit: result.limit } });
});
