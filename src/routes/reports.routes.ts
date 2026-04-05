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

// ── Purchase Reports (M15) ──

// GET /reports/supplier-purchases
reportRoutes.get('/supplier-purchases', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = c.req.query();
  const result = await reportService.getSupplierPurchases(auth.tenantId, {
    from: query.from, to: query.to,
  });
  return c.json({ data: result });
});

// GET /reports/purchase-summary
reportRoutes.get('/purchase-summary', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = c.req.query();
  const result = await reportService.getPurchaseSummary(auth.tenantId, {
    from: query.from, to: query.to,
  });
  return c.json({ data: result });
});

// ── Sales Reports (M18b) ──

const withDateRange = (c: any) => ({ from: c.req.query('from'), to: c.req.query('to') });

reportRoutes.get('/sales-summary', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getSalesSummary(auth.tenantId, withDateRange(c)) });
});

reportRoutes.get('/sales-by-category', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getSalesByCategory(auth.tenantId, withDateRange(c)) });
});

reportRoutes.get('/sales-by-product', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getSalesByProduct(auth.tenantId, withDateRange(c)) });
});

reportRoutes.get('/sales-by-brand', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getSalesByBrand(auth.tenantId, withDateRange(c)) });
});

reportRoutes.get('/sales-trend', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getSalesTrend(auth.tenantId, withDateRange(c)) });
});

// ── Profit Reports ──

reportRoutes.get('/profit-margins', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getProfitMargins(auth.tenantId, withDateRange(c)) });
});

reportRoutes.get('/pnl', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getPnl(auth.tenantId, withDateRange(c)) });
});

reportRoutes.get('/discount-impact', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getDiscountImpact(auth.tenantId, withDateRange(c)) });
});

// ── Credit Reports ──

reportRoutes.get('/customer-outstanding', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getCustomerOutstanding(auth.tenantId) });
});

reportRoutes.get('/supplier-outstanding', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getSupplierOutstanding(auth.tenantId) });
});

reportRoutes.get('/credit-aging', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getCreditAging(auth.tenantId) });
});

reportRoutes.get('/payment-collections', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getPaymentCollections(auth.tenantId, withDateRange(c)) });
});

// ── Staff Reports ──

reportRoutes.get('/staff-activity', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getStaffActivity(auth.tenantId, withDateRange(c)) });
});

// ── Expense Reports ──

reportRoutes.get('/expense-summary', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getExpenseSummary(auth.tenantId, withDateRange(c)) });
});

// ── GST Reports ──

reportRoutes.get('/gst-summary', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getGstSummary(auth.tenantId, withDateRange(c)) });
});

reportRoutes.get('/hsn-summary', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  return c.json({ data: await reportService.getHsnSummary(auth.tenantId, withDateRange(c)) });
});
