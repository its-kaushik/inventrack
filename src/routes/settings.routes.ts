import { Hono } from 'hono';
import { z } from 'zod';
import * as tenantService from '../services/tenant.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const settings = new Hono<AppEnv>();

// All settings routes require auth + owner role
settings.use('*', authMiddleware, tenantScope, requireRole('owner'));

settings.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const data = await tenantService.getSettings(tenantId);
  return c.json(success(data));
});

settings.patch('/', validate(z.object({}).passthrough()), async (c) => {
  const { tenantId } = c.get('tenant');
  const patch = c.get('validatedBody') as Record<string, unknown>;
  const data = await tenantService.updateSettings(tenantId, patch);
  return c.json(success(data));
});

settings.get('/store', async (c) => {
  const { tenantId } = c.get('tenant');
  const data = await tenantService.getStore(tenantId);
  return c.json(success(data));
});

const updateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  logoUrl: z.string().url().optional(),
  gstin: z.string().max(15).optional(),
  gstScheme: z.enum(['regular', 'composition']).optional(),
  financialYearStart: z.number().min(1).max(12).optional(),
  invoicePrefix: z.string().max(10).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

settings.patch('/store', validate(updateStoreSchema), async (c) => {
  const { tenantId } = c.get('tenant');
  const patch = c.get('validatedBody') as z.infer<typeof updateStoreSchema>;
  const data = await tenantService.updateStore(tenantId, patch);
  return c.json(success(data));
});

export default settings;
