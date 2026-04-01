import { Hono } from 'hono';
import { z } from 'zod';
import * as customerService from '../services/customer.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const customersRouter = new Hono<AppEnv>();
customersRouter.use('*', authMiddleware, tenantScope);

// Phone search — must be before /:id
customersRouter.get('/search', async (c) => {
  const { tenantId } = c.get('tenant');
  const phone = c.req.query('phone') || '';
  const data = await customerService.searchByPhone(tenantId, phone);
  return c.json(success(data));
});

customersRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    search: c.req.query('search'),
    withBalance: c.req.query('with_balance') === 'true',
    limit: Number(c.req.query('limit')) || 50,
    offset: Number(c.req.query('offset')) || 0,
  };
  const data = await customerService.listCustomers(tenantId, filters);
  return c.json(success(data));
});

customersRouter.post('/', validate(z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  address: z.string().optional(),
})), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const input = c.get('validatedBody') as any;
  const customer = await customerService.createCustomer(tenantId, userId, input);
  return c.json(success(customer), 201);
});

customersRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const customer = await customerService.getCustomerById(tenantId, c.req.param('id')!);
  return c.json(success(customer));
});

customersRouter.put('/:id', validate(z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(10).optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' })), async (c) => {
  const { tenantId } = c.get('tenant');
  const patch = c.get('validatedBody') as any;
  const customer = await customerService.updateCustomer(tenantId, c.req.param('id')!, patch);
  return c.json(success(customer));
});

customersRouter.get('/:id/ledger', async (c) => {
  const { tenantId } = c.get('tenant');
  const limit = Number(c.req.query('limit')) || 50;
  const offset = Number(c.req.query('offset')) || 0;
  const data = await customerService.getCustomerLedger(tenantId, c.req.param('id')!, limit, offset);
  return c.json(success(data));
});

customersRouter.post('/:id/payments', validate(z.object({
  amount: z.number().positive(),
  paymentMode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque', 'card']),
  paymentReference: z.string().optional(),
  description: z.string().optional(),
})), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const input = c.get('validatedBody') as any;
  const entry = await customerService.recordCustomerPayment(tenantId, userId, c.req.param('id')!, input);
  return c.json(success(entry), 201);
});

export default customersRouter;
