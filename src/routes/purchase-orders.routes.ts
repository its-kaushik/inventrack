import { Hono } from 'hono';
import { z } from 'zod';
import * as purchaseOrderService from '../services/purchase-order.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success, paginated } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const purchaseOrdersRouter = new Hono<AppEnv>();

purchaseOrdersRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

// ======================== SCHEMAS ========================

const createPOSchema = z.object({
  supplierId: z.string().uuid(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        orderedQty: z.number().int().positive(),
        expectedCost: z.number().positive(),
      }),
    )
    .min(1),
});

const updatePOSchema = z
  .object({
    notes: z.string().optional(),
    status: z.enum(['sent', 'cancelled']).optional(),
  })
  .refine((data) => data.notes !== undefined || data.status !== undefined, {
    message: 'At least one of notes or status must be provided',
  });

// ======================== ROUTES ========================

purchaseOrdersRouter.post('/', validate(createPOSchema), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const input = c.get('validatedBody') as z.infer<typeof createPOSchema>;
  const po = await purchaseOrderService.createPurchaseOrder(tenantId, userId, input);
  return c.json(success(po), 201);
});

purchaseOrdersRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    supplierId: c.req.query('supplier_id'),
    status: c.req.query('status'),
    limit: Number(c.req.query('limit')) || 20,
    offset: Number(c.req.query('offset')) || 0,
  };
  const result = await purchaseOrderService.listPurchaseOrders(tenantId, filters);
  return c.json(paginated(result.items, result.hasMore ? 'next' : null, result.hasMore));
});

purchaseOrdersRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const po = await purchaseOrderService.getPurchaseOrderById(tenantId, id);
  return c.json(success(po));
});

purchaseOrdersRouter.patch('/:id', validate(updatePOSchema), async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const patch = c.get('validatedBody') as z.infer<typeof updatePOSchema>;
  const po = await purchaseOrderService.updatePurchaseOrder(tenantId, id, patch);
  return c.json(success(po));
});

purchaseOrdersRouter.get('/:id/pdf', async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const po = await purchaseOrderService.getPurchaseOrderById(tenantId, id);
  return c.json(success(po));
});

export default purchaseOrdersRouter;
