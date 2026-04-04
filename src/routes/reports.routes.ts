import { Hono } from 'hono';
import * as reportService from '../services/report.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const reportsRouter = new Hono<AppEnv>();

reportsRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

// GET /:type — fetch report data
reportsRouter.get('/:type', async (c) => {
  const { tenantId } = c.get('tenant');
  const type = c.req.param('type')!;
  const params: reportService.ReportParams = {
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
    offset: c.req.query('offset') ? Number(c.req.query('offset')) : undefined,
    partyId: c.req.query('party_id'),
    registerId: c.req.query('register_id'),
  };
  const data = await reportService.getReport(tenantId, type, params);
  return c.json(success(data));
});

// POST /:type/export — stub for future export
reportsRouter.post('/:type/export', async (c) => {
  return c.json(
    success({
      jobId: 'not_implemented',
      message: 'Export coming soon',
    }),
  );
});

// GET /export/:jobId — stub for export status
reportsRouter.get('/export/:jobId', async (c) => {
  return c.json(
    success({
      status: 'not_implemented',
    }),
  );
});

export default reportsRouter;
