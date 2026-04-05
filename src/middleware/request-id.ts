import { createMiddleware } from 'hono/factory';
import { nanoid } from 'nanoid';
import type { AppEnv } from '../types/hono.js';

export const requestId = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const id = c.req.header('x-request-id') || nanoid();
    c.set('requestId', id);
    c.header('X-Request-Id', id);
    await next();
  });
