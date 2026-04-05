import { createMiddleware } from 'hono/factory';
import { env } from '../config/env.js';

export const requestLogger = () =>
  createMiddleware(async (c, next) => {
    const start = Date.now();

    await next();

    const duration = Date.now() - start;
    const requestId = c.get('requestId') as string | undefined;

    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId: requestId ?? null,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    };

    if (env.LOG_LEVEL === 'debug' || c.res.status >= 400) {
      if (c.res.status >= 500) {
        console.error(JSON.stringify(logEntry));
      } else if (c.res.status >= 400) {
        console.warn(JSON.stringify(logEntry));
      } else {
        console.info(JSON.stringify(logEntry));
      }
    } else {
      console.info(JSON.stringify(logEntry));
    }
  });
