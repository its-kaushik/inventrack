import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tenants } from '../db/schema/tenants.js';
import { AppError } from '../lib/errors.js';

export const tenantScope = createMiddleware(async (c, next) => {
  const { tenantId } = c.get('tenant');

  const [tenant] = await db
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new AppError(404, 'NOT_FOUND', 'Tenant not found');
  }

  if (tenant.status === 'suspended') {
    throw new AppError(403, 'TENANT_SUSPENDED', 'Your account has been suspended. Contact support.');
  }

  if (tenant.status === 'deleted') {
    throw new AppError(404, 'NOT_FOUND', 'Tenant not found');
  }

  await next();
});
