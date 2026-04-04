import { createMiddleware } from 'hono/factory';
import { jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { AuthError } from '../lib/errors.js';
import type { TenantContext, AdminContext } from '../types/context.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, secret);

    // Super admin tokens have role='super_admin' and no tenant ID
    if (payload.role === 'super_admin') {
      const adminContext: AdminContext = {
        adminId: payload.sub as string,
        isSuperAdmin: true,
      };
      c.set('adminUser', adminContext);
    } else {
      const tenantContext: TenantContext = {
        userId: payload.sub as string,
        tenantId: payload.tid as string,
        role: payload.role as TenantContext['role'],
      };
      c.set('tenant', tenantContext);
    }
  } catch {
    throw new AuthError('Invalid or expired token');
  }

  await next();
});
