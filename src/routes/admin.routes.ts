import { Hono } from 'hono';
import { z } from 'zod';
import { getCookie, setCookie } from 'hono/cookie';
import * as adminService from '../services/admin.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/require-super-admin.js';
import { validate } from '../middleware/validate.js';
import { success, paginated } from '../lib/response.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/hono.js';

const admin = new Hono<AppEnv>();

// ---------- Login (public, no auth) ----------

const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
});

admin.post('/login', validate(loginSchema), async (c) => {
  const { email, password } = c.get('validatedBody') as z.infer<typeof loginSchema>;

  const result = await adminService.adminLogin(email, password);

  setCookie(c, 'adminRefreshToken', result.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/api/v1/admin',
    maxAge: env.JWT_REFRESH_TTL,
  });

  return c.json(
    success({
      accessToken: result.accessToken,
      admin: result.admin,
    }),
  );
});

// ---------- Refresh (public, uses cookie) ----------

admin.post('/refresh', async (c) => {
  const rawToken = getCookie(c, 'adminRefreshToken');

  if (!rawToken) {
    return c.json(
      {
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'No refresh token', details: null },
      },
      401,
    );
  }

  const result = await adminService.adminRefresh(rawToken);

  setCookie(c, 'adminRefreshToken', result.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/api/v1/admin',
    maxAge: env.JWT_REFRESH_TTL,
  });

  return c.json(success({ accessToken: result.accessToken }));
});

// ---------- Protected routes (authMiddleware + requireSuperAdmin) ----------

admin.use('/*', authMiddleware, requireSuperAdmin);

// Dashboard
admin.get('/dashboard', async (c) => {
  const data = await adminService.getDashboard();
  return c.json(success(data));
});

// List tenants
admin.get('/tenants', async (c) => {
  const status = c.req.query('status');
  const plan = c.req.query('plan');
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = Number(c.req.query('offset')) || 0;

  const result = await adminService.listTenants({ status, plan, limit, offset });
  return c.json(paginated(result.items, null, result.hasMore));
});

// Get tenant by ID
admin.get('/tenants/:id', async (c) => {
  const tenantId = c.req.param('id');
  const data = await adminService.getTenantById(tenantId);
  return c.json(success(data));
});

// Update tenant
const updateTenantSchema = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  plan: z.enum(['free', 'basic', 'pro']).optional(),
});

admin.patch('/tenants/:id', validate(updateTenantSchema), async (c) => {
  const tenantId = c.req.param('id')!;
  const patch = c.get('validatedBody') as z.infer<typeof updateTenantSchema>;
  const data = await adminService.updateTenant(tenantId, patch);
  return c.json(success(data));
});

export default admin;
