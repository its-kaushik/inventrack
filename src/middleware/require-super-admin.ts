import { createMiddleware } from 'hono/factory';
import { ForbiddenError } from '../lib/errors.js';

export const requireSuperAdmin = createMiddleware(async (c, next) => {
  const admin = c.get('adminUser');
  if (!admin?.isSuperAdmin) {
    throw new ForbiddenError('Super admin access required');
  }
  await next();
});
