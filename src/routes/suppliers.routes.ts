import { Hono } from 'hono';
import { z } from 'zod';
import * as supplierService from '../services/supplier.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const suppliersRouter = new Hono<AppEnv>();
suppliersRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

suppliersRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const search = c.req.query('search');
  const data = await supplierService.listSuppliers(tenantId, search);
  return c.json(success(data));
});

suppliersRouter.post('/', validate(z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().max(15).optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
})), async (c) => {
  const { tenantId } = c.get('tenant');
  const input = c.get('validatedBody') as any;
  const supplier = await supplierService.createSupplier(tenantId, input);
  return c.json(success(supplier), 201);
});

suppliersRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const supplier = await supplierService.getSupplierById(tenantId, c.req.param('id')!);
  return c.json(success(supplier));
});

suppliersRouter.put('/:id', validate(z.object({
  name: z.string().min(1).optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().max(15).optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' })), async (c) => {
  const { tenantId } = c.get('tenant');
  const patch = c.get('validatedBody') as any;
  const supplier = await supplierService.updateSupplier(tenantId, c.req.param('id')!, patch);
  return c.json(success(supplier));
});

suppliersRouter.get('/:id/ledger', async (c) => {
  const { tenantId } = c.get('tenant');
  const limit = Number(c.req.query('limit')) || 50;
  const offset = Number(c.req.query('offset')) || 0;
  const data = await supplierService.getSupplierLedger(tenantId, c.req.param('id')!, limit, offset);
  return c.json(success(data));
});

suppliersRouter.post('/:id/payments', validate(z.object({
  amount: z.number().positive(),
  paymentMode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque', 'card']),
  paymentReference: z.string().optional(),
  description: z.string().optional(),
})), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const input = c.get('validatedBody') as any;
  const entry = await supplierService.recordSupplierPayment(tenantId, userId, c.req.param('id')!, input);
  return c.json(success(entry), 201);
});

suppliersRouter.get('/:id/products', async (c) => {
  const { tenantId } = c.get('tenant');
  const data = await supplierService.getSupplierProducts(tenantId, c.req.param('id')!);
  return c.json(success(data));
});

export default suppliersRouter;
