import { Hono } from 'hono';
import * as creditService from '../services/credit.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const creditRoutes = new Hono<AppEnv>();

// All credit routes require Owner or Manager (Salesman cannot see khata per BRD)
creditRoutes.use('*', authorize('owner', 'manager'));

// GET /credit/customers/summary — customer khata overview with aging
creditRoutes.get('/customers/summary', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const summary = await creditService.getCustomerKhataSummary(auth.tenantId);
  return c.json({ data: summary });
});

// GET /credit/suppliers/summary — supplier payables overview with aging
creditRoutes.get('/suppliers/summary', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const summary = await creditService.getSupplierPayablesSummary(auth.tenantId);
  return c.json({ data: summary });
});
