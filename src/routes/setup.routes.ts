import { Hono } from 'hono';
import { z } from 'zod';
import * as tenantService from '../services/tenant.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const setup = new Hono<AppEnv>();

const createTenantSchema = z.object({
  storeName: z.string().min(1, 'Store name is required'),
  ownerName: z.string().min(1, 'Owner name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().max(15).optional(),
  gstScheme: z.enum(['regular', 'composition']).optional(),
});

// Public — no auth required
setup.post('/tenant', validate(createTenantSchema), async (c) => {
  const input = c.get('validatedBody') as z.infer<typeof createTenantSchema>;
  const result = await tenantService.createTenant(input);

  return c.json(success({
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
      gstScheme: result.tenant.gstScheme,
    },
    owner: result.owner,
  }), 201);
});

// Requires auth + owner role
setup.put('/wizard', authMiddleware, requireRole('owner'), async (c) => {
  const { tenantId } = c.get('tenant');
  const tenant = await tenantService.completeSetup(tenantId);
  return c.json(success({ setupComplete: tenant.setupComplete }));
});

export default setup;
