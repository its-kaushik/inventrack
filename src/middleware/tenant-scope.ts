import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tenants } from '../db/schema/tenants.js';
import { AppError } from '../lib/errors.js';

export const tenantScope = createMiddleware(async (c, next) => {
  // Super admins bypass tenant scoping
  const admin = c.get('adminUser');
  if (admin?.isSuperAdmin) {
    await next();
    return;
  }

  const tenant = c.get('tenant');
  if (!tenant?.tenantId) {
    throw new AppError(401, 'UNAUTHORIZED', 'No tenant context');
  }

  const [row] = await db
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenant.tenantId))
    .limit(1);

  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Tenant not found');
  }

  if (row.status === 'suspended') {
    // Suspended tenants can still read data (GET) for export purposes
    const method = c.req.method;
    if (method !== 'GET') {
      throw new AppError(
        403,
        'TENANT_SUSPENDED',
        'Your account has been suspended. Read-only access is allowed for data export. Contact support.',
      );
    }
  }

  if (row.status === 'deleted') {
    throw new AppError(404, 'NOT_FOUND', 'Tenant not found');
  }

  await next();
});
