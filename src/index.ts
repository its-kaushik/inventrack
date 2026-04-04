import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import api from './routes/index.js';
import { env } from './config/env.js';
import { queryClient } from './config/database.js';
import { redis } from './config/redis.js';
import { logger } from './lib/logger.js';
import type { AppEnv } from './types/hono.js';

const app = new Hono<AppEnv>();

// Global middleware
app.use('*', requestId);

const corsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(
  '*',
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

// Health check — verifies DB and Redis connectivity
app.get('/health', async (c) => {
  let dbOk = false;
  let redisOk = false;

  try {
    await queryClient`SELECT 1`;
    dbOk = true;
  } catch (err) {
    logger.error({ err }, 'Health check: database unreachable');
  }

  if (redis) {
    try {
      await redis.ping();
      redisOk = true;
    } catch (err) {
      logger.error({ err }, 'Health check: Redis unreachable');
    }
  } else {
    // Redis is optional — mark as ok if not configured
    redisOk = true;
  }

  const status = dbOk && redisOk ? 'healthy' : 'degraded';
  const httpStatus = dbOk && redisOk ? 200 : 503;

  return c.json(
    {
      status,
      timestamp: new Date().toISOString(),
      db: dbOk,
      redis: redisOk,
    },
    httpStatus,
  );
});

// API v1 routes
app.route('/api/v1', api);

// Global error handler
app.onError(errorHandler);

export default app;
