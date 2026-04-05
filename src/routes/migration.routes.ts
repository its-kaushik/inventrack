import { Hono } from 'hono';
import * as migrationService from '../services/migration.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const migrationRoutes = new Hono<AppEnv>();

// All migration routes: Owner, Manager only
migrationRoutes.use('*', authorize('owner', 'manager'));

// POST /migration/customers — import customer khata from CSV
migrationRoutes.post('/customers', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);

  const body = await c.req.json() as { csv: string };
  if (!body.csv) throw new AppError('VALIDATION_ERROR', 'CSV content is required in the "csv" field', 400);

  const result = await migrationService.importCustomerKhata(auth.tenantId, auth.userId, body.csv);
  return c.json({ data: result });
});

// POST /migration/suppliers — import supplier balances from CSV
migrationRoutes.post('/suppliers', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);

  const body = await c.req.json() as { csv: string };
  if (!body.csv) throw new AppError('VALIDATION_ERROR', 'CSV content is required in the "csv" field', 400);

  const result = await migrationService.importSupplierBalances(auth.tenantId, auth.userId, body.csv);
  return c.json({ data: result });
});

// GET /migration/templates/:type — download CSV template
migrationRoutes.get('/templates/:type', async (c) => {
  const type = c.req.param('type') as keyof typeof migrationService.TEMPLATES;

  const template = migrationService.TEMPLATES[type];
  if (!template) {
    throw new AppError('NOT_FOUND', `Template "${type}" not found. Available: customers, suppliers`, 404);
  }

  return new Response(template, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${type}-import-template.csv"`,
    },
  });
});
