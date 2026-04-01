import { createMiddleware } from 'hono/factory';
import { randomUUID } from 'crypto';

export const requestId = createMiddleware(async (c, next) => {
  const id = c.req.header('x-request-id') || randomUUID();
  c.header('X-Request-Id', id);
  await next();
});
