import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { corsMiddleware } from './middleware/cors.js';
import { requestId } from './middleware/request-id.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { routes } from './routes/index.js';
import { env } from './config/env.js';
import { queryClient } from './db/client.js';
import type { AppEnv } from './types/hono.js';

const app = new OpenAPIHono<AppEnv>();

// 1. CORS — first, so preflight OPTIONS are handled
app.use('*', corsMiddleware());

// 2. Request ID — generates unique ID for tracing
app.use('*', requestId());

// 3. Request Logger — logs method, path, status, duration
app.use('*', requestLogger());

// 4. Global Error Handler — catches all unhandled errors
app.onError(errorHandler);

// 5. Health Check — public, no auth
app.get('/health', async (c) => {
  let dbStatus = 'disconnected';
  try {
    await queryClient`SELECT 1`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  return c.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    database: dbStatus,
    uptime: Math.floor(process.uptime()),
    version: '1.0.0',
  });
});

// 6. Swagger UI — available in development
if (env.NODE_ENV !== 'production') {
  app.doc('/api/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'InvenTrack API', version: '1.0.0' },
  });
  app.get('/docs', swaggerUI({ url: '/api/openapi.json' }));
}

// 7. Auth — applied to /api/* routes (public paths bypass inside the middleware)
import { authMiddleware } from './middleware/auth.js';
app.use('/api/*', authMiddleware());

// 8. Routes
app.route('/api/v1', routes);

// 404 catch-all
app.notFound((c) => {
  return c.json(
    { error: { code: 'NOT_FOUND', message: `Route not found: ${c.req.method} ${c.req.path}` } },
    404,
  );
});

export { app };
