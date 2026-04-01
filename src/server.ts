import { serve } from '@hono/node-server';
import app from './index.js';
import { env } from './config/env.js';

const server = serve({
  fetch: app.fetch,
  port: env.PORT,
}, (info) => {
  console.log(`InvenTrack API running on http://localhost:${info.port}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
