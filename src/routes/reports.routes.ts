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

// Phase 3 report endpoints will be added here:
// GET /reports/sales-summary
// GET /reports/sales-by-category
// GET /reports/sales-by-product
// GET /reports/sales-by-brand
// GET /reports/sales-trend
// GET /reports/profit-margins
// GET /reports/pnl
// GET /reports/discount-impact
// GET /reports/current-stock
// GET /reports/inventory-valuation
// GET /reports/dead-stock
// GET /reports/low-stock
// GET /reports/supplier-purchases
// GET /reports/purchase-summary
// GET /reports/purchase-vs-sales
// GET /reports/stock-movement
// GET /reports/customer-outstanding
// GET /reports/supplier-outstanding
// GET /reports/credit-aging
// GET /reports/payment-collections
// GET /reports/staff-activity
// GET /reports/gst-summary
// GET /reports/hsn-summary
// GET /reports/expense-summary
