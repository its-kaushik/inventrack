import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  recordCustomerPaymentSchema,
  customerListQuerySchema,
} from '../validators/customer.validators.js';
import * as customerService from '../services/customer.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const customerRoutes = new Hono<AppEnv>();

// GET /customers — all roles
customerRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = validate(customerListQuerySchema, c.req.query());
  const result = await customerService.listCustomers(auth.tenantId, query);
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) },
  });
});

// POST /customers — all roles (salesman can quick-add)
customerRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createCustomerSchema, await c.req.json());
  const customer = await customerService.createCustomer(auth.tenantId, auth.userId, body);
  return c.json({ data: customer }, 201);
});

// GET /customers/:id — all roles
customerRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const customer = await customerService.getCustomerById(auth.tenantId, id);
  return c.json({ data: customer });
});

// PATCH /customers/:id — all roles
customerRoutes.patch('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(updateCustomerSchema, await c.req.json());
  const customer = await customerService.updateCustomer(auth.tenantId, id, auth.userId, body);
  return c.json({ data: customer });
});

// GET /customers/:id/ledger — Owner, Manager only (per BRD: salesman cannot see khata)
customerRoutes.get('/:id/ledger', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const query = c.req.query();
  const result = await customerService.getCustomerLedger(auth.tenantId, id, {
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 50,
  });
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

// POST /customers/:id/payments — Owner, Manager only
customerRoutes.post('/:id/payments', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(recordCustomerPaymentSchema, await c.req.json());
  const result = await customerService.recordPayment(auth.tenantId, id, auth.userId, body);
  return c.json({ data: result });
});
