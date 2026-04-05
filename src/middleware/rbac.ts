import { createMiddleware } from 'hono/factory';
import { AppError } from '../types/errors.js';
import type { Role } from '../types/enums.js';
import type { AppEnv } from '../types/hono.js';

export const authorize = (...allowedRoles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const auth = c.get('auth');
    if (!auth) throw new AppError('UNAUTHORIZED', 'Not authenticated', 401);

    if (!allowedRoles.includes(auth.role))
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);

    await next();
  });
