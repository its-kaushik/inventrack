import { cors as honoCors } from 'hono/cors';
import { env } from '../config/env.js';

export const corsMiddleware = () =>
  honoCors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86400,
  });
