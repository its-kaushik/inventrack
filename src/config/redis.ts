import Redis from 'ioredis';
import { env } from './env.js';

let redis: Redis | null = null;

if (env.REDIS_URL) {
  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });

  redis.on('error', (err) => {
    console.warn('Redis connection error (non-fatal):', err.message);
  });

  redis.connect().catch(() => {
    console.warn('Redis not available — caching and rate limiting disabled');
    redis = null;
  });
}

export { redis };
