import { Hono } from 'hono';
import { z } from 'zod';
import * as purchaseReturnService from '../services/purchase-return.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const purchaseReturnsRouter = new Hono<AppEnv>();

purchaseReturnsRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

const createPurchaseReturnSchema = z.object({
  purchaseId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
        costPrice: z.number().positive(),
      }),
    )
    .min(1),
  reason: z.string().optional(),
});

purchaseReturnsRouter.post('/', validate(createPurchaseReturnSchema), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const input = c.get('validatedBody') as z.infer<typeof createPurchaseReturnSchema>;
  const result = await purchaseReturnService.createPurchaseReturn(tenantId, userId, input);
  return c.json(success(result), 201);
});

export default purchaseReturnsRouter;
