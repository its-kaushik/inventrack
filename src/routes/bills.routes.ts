import { Hono } from 'hono';
import { z } from 'zod';
import * as billingService from '../services/billing.service.js';
import * as syncService from '../services/sync.service.js';
import * as heldBillService from '../services/held-bill.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { validate } from '../middleware/validate.js';
import { success, paginated } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const billsRouter = new Hono<AppEnv>();

billsRouter.use('*', authMiddleware, tenantScope);

const createBillSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  payments: z
    .array(
      z.object({
        mode: z.enum(['cash', 'upi', 'card', 'credit']),
        amount: z.number().positive(),
        reference: z.string().optional(),
      }),
    )
    .min(1),
  customerId: z.string().uuid().nullable().optional(),
  additionalDiscountAmount: z.number().min(0).default(0),
  additionalDiscountPct: z.number().min(0).max(100).default(0),
  clientId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const syncBillsSchema = z.object({
  bills: z
    .array(
      z.object({
        clientId: z.string().uuid(),
        offlineCreatedAt: z.string(),
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.number().int().positive(),
            }),
          )
          .min(1),
        payments: z
          .array(
            z.object({
              mode: z.enum(['cash', 'upi', 'card', 'credit']),
              amount: z.number().positive(),
              reference: z.string().optional(),
            }),
          )
          .min(1),
        customerId: z.string().uuid().nullable().optional(),
        additionalDiscountAmount: z.number().min(0).optional(),
        additionalDiscountPct: z.number().min(0).max(100).optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

const holdBillSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  customerId: z.string().uuid().nullable().optional(),
  additionalDiscountAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

// ======================== SYNC ENDPOINT ========================

billsRouter.post('/sync', validate(syncBillsSchema), async (c) => {
  const { tenantId, userId, role } = c.get('tenant');
  const { bills } = c.get('validatedBody') as z.infer<typeof syncBillsSchema>;
  const result = await syncService.syncOfflineBills(tenantId, userId, role, bills);
  return c.json(success(result));
});

// ======================== HELD BILL ENDPOINTS ========================

billsRouter.post('/hold', validate(holdBillSchema), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const input = c.get('validatedBody') as z.infer<typeof holdBillSchema>;
  const bill = await heldBillService.holdBill(tenantId, userId, input);
  return c.json(success(bill), 201);
});

billsRouter.get('/held', async (c) => {
  const { tenantId } = c.get('tenant');
  const heldBills = await heldBillService.listHeldBills(tenantId);
  return c.json(success(heldBills));
});

billsRouter.post('/held/:id/resume', async (c) => {
  const { tenantId } = c.get('tenant');
  const billId = c.req.param('id')!;
  const cartData = await heldBillService.resumeHeldBill(tenantId, billId);
  return c.json(success(cartData));
});

billsRouter.delete('/held/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const billId = c.req.param('id')!;
  await heldBillService.discardHeldBill(tenantId, billId);
  return c.json(success({ deleted: true }));
});

// ======================== STANDARD BILL ENDPOINTS ========================

billsRouter.post('/', validate(createBillSchema), async (c) => {
  const { tenantId, userId, role } = c.get('tenant');
  const input = c.get('validatedBody') as z.infer<typeof createBillSchema>;
  const bill = await billingService.createBill(tenantId, userId, role, input);
  return c.json(success(bill), 201);
});

billsRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    customerId: c.req.query('customer_id'),
    salespersonId: c.req.query('salesperson_id'),
    status: c.req.query('status'),
    limit: Number(c.req.query('limit')) || 20,
    offset: Number(c.req.query('offset')) || 0,
  };
  const result = await billingService.listBills(tenantId, filters);
  return c.json(paginated(result.items, result.hasMore ? 'next' : null, result.hasMore));
});

billsRouter.get('/:id/print', async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const data = await billingService.getBillForPrint(tenantId, id);
  return c.json(success(data));
});

billsRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const bill = await billingService.getBillById(tenantId, id);
  return c.json(success(bill));
});

export default billsRouter;
