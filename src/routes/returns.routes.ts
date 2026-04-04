import { Hono } from 'hono';
import { z } from 'zod';
import * as returnService from '../services/return.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success, paginated } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const returnsRouter = new Hono<AppEnv>();

returnsRouter.use('*', authMiddleware, tenantScope);

const processReturnSchema = z.object({
  originalBillId: z.string().uuid(),
  refundMode: z.enum(['cash', 'credit_note', 'exchange']),
  reason: z.string().optional(),
  items: z
    .array(
      z.object({
        billItemId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  exchangeBillId: z.string().uuid().optional(),
});

returnsRouter.post(
  '/',
  requireRole('owner', 'manager'),
  validate(processReturnSchema),
  async (c) => {
    const { tenantId, userId, role } = c.get('tenant');
    const input = c.get('validatedBody') as z.infer<typeof processReturnSchema>;
    const returnRecord = await returnService.processReturn(tenantId, userId, role, input);
    return c.json(success(returnRecord), 201);
  },
);

returnsRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    originalBillId: c.req.query('original_bill_id'),
    limit: Number(c.req.query('limit')) || 20,
    offset: Number(c.req.query('offset')) || 0,
  };
  const result = await returnService.listReturns(tenantId, filters);
  return c.json(paginated(result.items, result.hasMore ? 'next' : null, result.hasMore));
});

returnsRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const returnRecord = await returnService.getReturnById(tenantId, id);
  return c.json(success(returnRecord));
});

export default returnsRouter;
