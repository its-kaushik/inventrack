import { Hono } from 'hono';
import { z } from 'zod';
import * as syncConflictService from '../services/sync-conflict.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success, paginated } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const syncConflictsRouter = new Hono<AppEnv>();

syncConflictsRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

const resolveConflictSchema = z.object({
  action: z.enum(['force_accepted', 'edited', 'voided']),
  notes: z.string().optional(),
});

syncConflictsRouter.get('/count', async (c) => {
  const { tenantId } = c.get('tenant');
  const count = await syncConflictService.getConflictCount(tenantId);
  return c.json(success({ count }));
});

syncConflictsRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    status: (c.req.query('status') as any) || undefined,
    limit: Number(c.req.query('limit')) || 20,
    offset: Number(c.req.query('offset')) || 0,
  };
  const result = await syncConflictService.listConflicts(tenantId, filters);
  return c.json(paginated(result.items, result.hasMore ? 'next' : null, result.hasMore));
});

syncConflictsRouter.post('/:id/resolve', validate(resolveConflictSchema), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const conflictId = c.req.param('id')!;
  const { action, notes } = c.get('validatedBody') as z.infer<typeof resolveConflictSchema>;
  const resolved = await syncConflictService.resolveConflict(
    tenantId,
    conflictId,
    userId,
    action,
    notes,
  );
  return c.json(success(resolved));
});

export default syncConflictsRouter;
