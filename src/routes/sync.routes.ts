import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import * as syncService from '../services/sync.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import { z } from 'zod';
import type { AppEnv } from '../types/hono.js';

export const syncRoutes = new Hono<AppEnv>();

// GET /sync/catalog — download catalog for offline cache
syncRoutes.get('/catalog', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const since = c.req.query('since');
  const catalog = await syncService.getCatalog(auth.tenantId, since || undefined);
  return c.json({ data: catalog });
});

// POST /sync/bills — upload offline bills
syncRoutes.post('/bills', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);

  const body = await c.req.json();
  const schema = z.object({
    bills: z.array(z.object({
      clientId: z.string().uuid(),
      customerId: z.string().uuid(),
      newCustomer: z.object({
        name: z.string(),
        phone: z.string(),
        clientId: z.string().uuid(),
      }).optional(),
      items: z.array(z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })).min(1),
      billDiscountPct: z.number().min(0).max(100).default(0),
      bargainAdjustment: z.number().min(0).optional(),
      finalPrice: z.number().positive().optional(),
      payments: z.array(z.object({
        method: z.enum(['cash', 'upi', 'card', 'credit']),
        amount: z.number().nonnegative(),
      })).min(1),
      createdAt: z.string().optional(),
    })),
  });

  const validated = validate(schema, body);
  const results = await syncService.syncBills(validated.bills, auth);

  return c.json({
    data: {
      results,
      synced: results.filter((r) => r.status === 'synced').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
    },
  });
});

// GET /sync/conflicts — list unresolved conflicts
syncRoutes.get('/conflicts', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const status = c.req.query('status') as 'unresolved' | 'resolved' | undefined;
  const conflicts = await syncService.listConflicts(auth.tenantId, status);
  return c.json({ data: conflicts });
});

// POST /sync/conflicts/:id/resolve — resolve a conflict
syncRoutes.post('/conflicts/:id/resolve', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const { resolution } = await c.req.json() as { resolution: string };

  if (!resolution) throw new AppError('VALIDATION_ERROR', 'Resolution text is required', 400);

  const conflict = await syncService.resolveConflict(auth.tenantId, id, auth.userId, resolution);
  return c.json({ data: conflict });
});
