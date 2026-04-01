import type { Context, Next } from 'hono';
import { ForbiddenError } from '../lib/errors.js';
import type { UserRole } from '../types/enums.js';

export function requireRole(...roles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const tenant = c.get('tenant');
    if (!tenant || !roles.includes(tenant.role)) {
      throw new ForbiddenError('Insufficient permissions for this action');
    }
    await next();
  };
}
