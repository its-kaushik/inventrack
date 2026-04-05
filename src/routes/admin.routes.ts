import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import { createTenantSchema, updateTenantSchema } from '../validators/settings.validators.js';
import * as tenantService from '../services/tenant.service.js';
import { authorize } from '../middleware/rbac.js';
import type { AppEnv } from '../types/hono.js';

export const adminRoutes = new Hono<AppEnv>();

// All admin routes require super_admin role
adminRoutes.use('*', authorize('super_admin'));

// GET /admin/tenants
adminRoutes.get('/tenants', async (c) => {
  const tenants = await tenantService.listTenants();
  return c.json({ data: tenants });
});

// POST /admin/tenants
adminRoutes.post('/tenants', async (c) => {
  const body = validate(createTenantSchema, await c.req.json());
  const tenant = await tenantService.createTenant(body);
  return c.json({ data: tenant }, 201);
});

// GET /admin/tenants/:id
adminRoutes.get('/tenants/:id', async (c) => {
  const { id } = validate(uuidParam, c.req.param());
  const tenant = await tenantService.getTenantById(id);
  return c.json({ data: tenant });
});

// PATCH /admin/tenants/:id
adminRoutes.patch('/tenants/:id', async (c) => {
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(updateTenantSchema, await c.req.json());
  const tenant = await tenantService.updateTenant(id, body);
  return c.json({ data: tenant });
});

// POST /admin/tenants/:id/suspend
adminRoutes.post('/tenants/:id/suspend', async (c) => {
  const { id } = validate(uuidParam, c.req.param());
  const tenant = await tenantService.updateTenantStatus(id, 'suspended');
  return c.json({ data: tenant });
});

// POST /admin/tenants/:id/reactivate
adminRoutes.post('/tenants/:id/reactivate', async (c) => {
  const { id } = validate(uuidParam, c.req.param());
  const tenant = await tenantService.updateTenantStatus(id, 'active');
  return c.json({ data: tenant });
});

// DELETE /admin/tenants/:id
adminRoutes.delete('/tenants/:id', async (c) => {
  const { id } = validate(uuidParam, c.req.param());
  await tenantService.deleteTenant(id);
  return c.json({ data: { message: 'Tenant deleted' } });
});
