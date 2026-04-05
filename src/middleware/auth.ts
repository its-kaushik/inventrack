import { createMiddleware } from 'hono/factory';
import { verifyAccessToken } from '../services/auth.service.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

const PUBLIC_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
]);

export const authMiddleware = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (PUBLIC_PATHS.has(c.req.path)) return next();

    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer '))
      throw new AppError('UNAUTHORIZED', 'Missing or invalid authorization header', 401);

    const token = header.slice(7);
    const payload = await verifyAccessToken(token);

    c.set('auth', {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    });

    await next();
  });
