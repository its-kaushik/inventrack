import Redis from 'ioredis';
import { env } from '../config/env.js';

export function createBullMQConnection() {
  if (!env.REDIS_URL) return null;
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
