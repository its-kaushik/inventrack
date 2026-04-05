import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import { createSaleSchema, parkBillSchema, saleListQuerySchema } from '../validators/sales.validators.js';
import * as salesService from '../services/sales.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const salesRoutes = new Hono<AppEnv>();

// All sales routes require owner or manager (salesman cannot bill per BRD)
salesRoutes.use('*', authorize('owner', 'manager'));

// POST /sales — create sale
salesRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createSaleSchema, await c.req.json());
  const sale = await salesService.createSale(auth, body);
  return c.json({ data: sale }, 201);
});

// GET /sales — list bills
salesRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = validate(saleListQuerySchema, c.req.query());
  const result = await salesService.listSales(auth.tenantId, query);
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) },
  });
});

// ── Park/Recall routes BEFORE /:id to avoid route collision ──

// POST /sales/park — park a bill
salesRoutes.post('/park', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(parkBillSchema, await c.req.json());
  const parked = await salesService.parkBill(auth.tenantId, auth.userId, body);
  return c.json({ data: parked }, 201);
});

// GET /sales/parked — list parked bills
salesRoutes.get('/parked', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const parked = await salesService.listParkedBills(auth.tenantId);
  return c.json({ data: parked });
});

// POST /sales/parked/:id/recall — recall parked bill
salesRoutes.post('/parked/:id/recall', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const parked = await salesService.recallParkedBill(auth.tenantId, id);
  return c.json({ data: parked });
});

// DELETE /sales/parked/:id — delete parked bill
salesRoutes.delete('/parked/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  await salesService.deleteParkedBill(auth.tenantId, id);
  return c.json({ data: { message: 'Parked bill deleted' } });
});

// ── Parameterized route AFTER specific routes ──

// GET /sales/:id — bill detail
salesRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const sale = await salesService.getSaleById(auth.tenantId, id);
  return c.json({ data: sale });
});
