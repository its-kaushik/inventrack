import { Hono } from 'hono';
import { z } from 'zod';
import * as gstService from '../services/gst.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { success } from '../lib/response.js';
import { ValidationError } from '../lib/errors.js';
import type { AppEnv } from '../types/hono.js';

const gstRouter = new Hono<AppEnv>();

gstRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

function requireDateRange(c: any): { from: string; to: string } {
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!from || !to) {
    throw new ValidationError('Both "from" and "to" query parameters are required');
  }
  return { from, to };
}

gstRouter.get('/summary', async (c) => {
  const { tenantId } = c.get('tenant');
  const { from, to } = requireDateRange(c);
  const data = await gstService.getSummary(tenantId, from, to);
  return c.json(success(data));
});

gstRouter.get('/gstr1', async (c) => {
  const { tenantId } = c.get('tenant');
  const { from, to } = requireDateRange(c);
  const data = await gstService.getGstr1(tenantId, from, to);
  return c.json(success(data));
});

gstRouter.get('/gstr3b', async (c) => {
  const { tenantId } = c.get('tenant');
  const { from, to } = requireDateRange(c);
  const data = await gstService.getGstr3b(tenantId, from, to);
  return c.json(success(data));
});

gstRouter.get('/cmp08', async (c) => {
  const { tenantId } = c.get('tenant');
  const quarter = Number(c.req.query('quarter'));
  const fy = c.req.query('fy');

  if (!quarter || quarter < 1 || quarter > 4 || !Number.isInteger(quarter)) {
    throw new ValidationError('Query parameter "quarter" must be an integer between 1 and 4');
  }
  if (!fy || !/^\d{4}-\d{4}$/.test(fy)) {
    throw new ValidationError(
      'Query parameter "fy" must be in format "YYYY-YYYY" (e.g. "2025-2026")',
    );
  }

  const data = await gstService.getCmp08(tenantId, quarter, fy);
  return c.json(success(data));
});

gstRouter.get('/gstr4', async (c) => {
  const { tenantId } = c.get('tenant');
  const fy = c.req.query('fy');

  if (!fy || !/^\d{4}-\d{4}$/.test(fy)) {
    throw new ValidationError(
      'Query parameter "fy" must be in format "YYYY-YYYY" (e.g. "2025-2026")',
    );
  }

  const data = await gstService.getGstr4(tenantId, fy);
  return c.json(success(data));
});

gstRouter.get('/itc', async (c) => {
  const { tenantId } = c.get('tenant');
  const { from, to } = requireDateRange(c);
  const data = await gstService.getItcRegister(tenantId, from, to);
  return c.json(success(data));
});

gstRouter.get('/hsn-summary', async (c) => {
  const { tenantId } = c.get('tenant');
  const { from, to } = requireDateRange(c);
  const data = await gstService.getHsnSummary(tenantId, from, to);
  return c.json(success(data));
});

export default gstRouter;
