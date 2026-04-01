import type { Context, Next } from 'hono';
import { redis } from '../config/redis.js';
import { RateLimitError } from '../lib/errors.js';

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
  keyFn: (c: Context) => string;
}

export function rateLimit(options: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    if (!redis) {
      await next();
      return;
    }

    const key = `${options.keyPrefix}:${options.keyFn(c)}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, options.windowSeconds);
      }

      if (current > options.maxRequests) {
        throw new RateLimitError();
      }
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      // Redis error — skip rate limiting gracefully
    }

    await next();
  };
}

export const loginRateLimit = rateLimit({
  windowSeconds: 60,
  maxRequests: 5,
  keyPrefix: 'ratelimit:login',
  keyFn: (c) => c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
});

export const apiRateLimit = rateLimit({
  windowSeconds: 1,
  maxRequests: 100,
  keyPrefix: 'ratelimit:api',
  keyFn: (c) => {
    try {
      const tenant = c.get('tenant');
      return tenant?.tenantId || 'anonymous';
    } catch {
      return 'anonymous';
    }
  },
});
