import { createMiddleware } from 'hono/factory';
import { AppError } from '../types/errors.js';

const store = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

export const rateLimit = (opts: { max: number; windowMs: number }) =>
  createMiddleware(async (c, next) => {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === 'test') return next();

    const key = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
    } else if (entry.count >= opts.max) {
      throw new AppError('RATE_LIMITED', 'Too many requests. Please try again later.', 429);
    } else {
      entry.count++;
    }

    await next();
  });
