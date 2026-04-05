import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './config/env.js';
import { startWorker, stopWorker } from './jobs/worker.js';

async function main() {
  // Start background job worker
  try {
    await startWorker();
  } catch (err) {
    console.warn('[startup] pg-boss worker failed to start (database may not be ready):', (err as Error).message);
  }

  // Start HTTP server
  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.info(`[startup] InvenTrack API running on port ${info.port}`);
    console.info(`[startup] Environment: ${env.NODE_ENV}`);
    if (env.NODE_ENV !== 'production') {
      console.info(`[startup] Swagger UI: http://localhost:${info.port}/docs`);
    }
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.info(`[shutdown] Received ${signal}, shutting down...`);
    await stopWorker();
    server.close(() => {
      console.info('[shutdown] Server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
