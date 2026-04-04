import { Hono } from 'hono';
import { z } from 'zod';
import * as purchaseService from '../services/purchase.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success, paginated } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const purchasesRouter = new Hono<AppEnv>();

purchasesRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

const createPurchaseSchema = z.object({
  supplierId: z.string().uuid(),
  poId: z.string().uuid().optional(),
  invoiceNumber: z.string().max(50).optional(),
  invoiceDate: z.string().optional(),
  invoiceImageUrl: z.string().url().optional(),
  totalAmount: z.number().positive(),
  cgstAmount: z.number().min(0).optional(),
  sgstAmount: z.number().min(0).optional(),
  igstAmount: z.number().min(0).optional(),
  isRcm: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
        costPrice: z.number().positive(),
        gstRate: z.number().min(0).optional(),
        gstAmount: z.number().min(0).optional(),
      }),
    )
    .min(1),
});

purchasesRouter.post('/', validate(createPurchaseSchema), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const input = c.get('validatedBody') as z.infer<typeof createPurchaseSchema>;
  const purchase = await purchaseService.createPurchase(tenantId, userId, input);
  return c.json(success(purchase), 201);
});

purchasesRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    supplierId: c.req.query('supplier_id'),
    limit: Number(c.req.query('limit')) || 20,
    offset: Number(c.req.query('offset')) || 0,
  };
  const result = await purchaseService.listPurchases(tenantId, filters);
  return c.json(paginated(result.items, result.hasMore ? 'next' : null, result.hasMore));
});

purchasesRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const purchase = await purchaseService.getPurchaseById(tenantId, id);
  return c.json(success(purchase));
});

export default purchasesRouter;
