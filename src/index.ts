import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';

const app = new Hono();

// Global middleware
app.use('*', requestId);
app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// Health check
app.get('/health', async (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API routes will be registered here
// app.route('/api/v1', apiRoutes);

// Global error handler
app.onError(errorHandler);

export default app;
