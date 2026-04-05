import { Hono } from 'hono';
import * as reportService from '../services/report.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const reportRoutes = new Hono<AppEnv>();

// All report routes: Owner, Manager only (Salesman cannot see reports per BRD)
reportRoutes.use('*', authorize('owner', 'manager'));

// GET /reports/dashboard — main dashboard summary
reportRoutes.get('/dashboard', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const dashboard = await reportService.getDashboard(auth.tenantId);
  return c.json({ data: dashboard });
});

// ── Inventory Reports (M14) ──

// GET /reports/current-stock
reportRoutes.get('/current-stock', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = c.req.query();
  const result = await reportService.getCurrentStock(auth.tenantId, {
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 50,
  });
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

// GET /reports/inventory-valuation
reportRoutes.get('/inventory-valuation', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const valuation = await reportService.getInventoryValuation(auth.tenantId);
  return c.json({ data: valuation });
});

// GET /reports/dead-stock
reportRoutes.get('/dead-stock', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const result = await reportService.getDeadStock(auth.tenantId);
  return c.json({ data: result });
});

// GET /reports/low-stock
reportRoutes.get('/low-stock', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const result = await reportService.getLowStockReport(auth.tenantId);
  return c.json({ data: result });
});

// Remaining Phase 3 report endpoints to be added:
// GET /reports/sales-summary, sales-by-category, sales-by-product, sales-by-brand, sales-trend
// GET /reports/profit-margins, pnl, discount-impact
// GET /reports/supplier-purchases, purchase-summary, purchase-vs-sales, stock-movement
// GET /reports/customer-outstanding, supplier-outstanding, credit-aging, payment-collections
// GET /reports/staff-activity, gst-summary, hsn-summary, expense-summary
