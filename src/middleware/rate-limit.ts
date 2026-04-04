import type { Context, Next } from 'hono';
import { redis } from '../config/redis.js';
import { RateLimitError } from '../lib/errors.js';
import { sql } from 'drizzle-orm';
import { db } from '../config/database.js';

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

// Plan-based rate limits per second
const PLAN_LIMITS: Record<string, number> = {
  free: 10,
  basic: 50,
  pro: 100,
};

async function getTenantPlan(tenantId: string): Promise<string> {
  if (!redis) return 'pro'; // No Redis = no enforcement, default to highest

  // Check Redis cache first (5-min TTL)
  const cacheKey = `tenant:${tenantId}:plan`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  } catch {
    /* Redis error — fallback to DB */
  }

  // Fetch from DB
  try {
    const [row] = (await db.execute(
      sql`SELECT plan FROM tenants WHERE id = ${tenantId} LIMIT 1`,
    )) as any[];
    const plan = row?.plan ?? 'free';

    // Cache for 5 minutes
    try {
      await redis.setex(cacheKey, 300, plan);
    } catch {
      /* ignore cache write failure */
    }

    return plan;
  } catch {
    return 'free'; // DB error — default to most restrictive
  }
}

export const apiRateLimit = async (c: Context, next: Next) => {
  if (!redis) {
    await next();
    return;
  }

  // Super admins bypass rate limiting
  try {
    const admin = c.get('adminUser');
    if (admin?.isSuperAdmin) {
      await next();
      return;
    }
  } catch {
    /* no admin context — proceed with rate limiting */
  }

  let tenantId: string;
  try {
    const tenant = c.get('tenant');
    tenantId = tenant?.tenantId || 'anonymous';
  } catch {
    tenantId = 'anonymous';
  }

  if (tenantId === 'anonymous') {
    await next();
    return;
  }

  const plan = await getTenantPlan(tenantId);
  const maxRequests = PLAN_LIMITS[plan] ?? 100;

  const key = `ratelimit:api:${tenantId}`;
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, 1);
    }
    if (current > maxRequests) {
      throw new RateLimitError();
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
  }

  await next();
};
