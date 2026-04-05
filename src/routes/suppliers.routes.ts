import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  recordSupplierPaymentSchema,
  supplierListQuerySchema,
} from '../validators/supplier.validators.js';
import * as supplierService from '../services/supplier.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const supplierRoutes = new Hono<AppEnv>();

// GET /suppliers — all roles can view
supplierRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = validate(supplierListQuerySchema, c.req.query());
  const result = await supplierService.listSuppliers(auth.tenantId, query);
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) },
  });
});

// POST /suppliers — Owner, Manager only
supplierRoutes.post('/', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createSupplierSchema, await c.req.json());
  const supplier = await supplierService.createSupplier(auth.tenantId, auth.userId, body);
  return c.json({ data: supplier }, 201);
});

// GET /suppliers/:id — all roles
supplierRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const supplier = await supplierService.getSupplierById(auth.tenantId, id);
  return c.json({ data: supplier });
});

// PATCH /suppliers/:id — Owner, Manager only
supplierRoutes.patch('/:id', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(updateSupplierSchema, await c.req.json());
  const supplier = await supplierService.updateSupplier(auth.tenantId, id, auth.userId, body);
  return c.json({ data: supplier });
});

// DELETE /suppliers/:id — Owner, Manager only (soft delete)
supplierRoutes.delete('/:id', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  await supplierService.deactivateSupplier(auth.tenantId, id, auth.userId);
  return c.json({ data: { message: 'Supplier deactivated' } });
});

// GET /suppliers/:id/ledger — Owner, Manager only
supplierRoutes.get('/:id/ledger', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const query = c.req.query();
  const result = await supplierService.getSupplierLedger(auth.tenantId, id, {
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 50,
  });
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

// POST /suppliers/:id/payments — Owner, Manager only
supplierRoutes.post('/:id/payments', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(recordSupplierPaymentSchema, await c.req.json());
  const result = await supplierService.recordPayment(auth.tenantId, id, auth.userId, body);
  return c.json({ data: result });
});
