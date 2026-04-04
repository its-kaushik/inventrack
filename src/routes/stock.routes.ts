import { Hono } from 'hono';
import { z } from 'zod';
import * as stockService from '../services/stock.service.js';
import * as stockAdjustmentService from '../services/stock-adjustment.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const stockRouter = new Hono<AppEnv>();

stockRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

stockRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    categoryId: c.req.query('category_id'),
    status: c.req.query('status') as any,
    limit: Number(c.req.query('limit')) || 20,
    offset: Number(c.req.query('offset')) || 0,
  };
  const data = await stockService.getStockOverview(tenantId, filters);
  return c.json(success(data));
});

// ======================== STOCK ADJUSTMENT SCHEMAS ========================

const adjustSchema = z.object({
  productId: z.string().uuid(),
  quantityChange: z
    .number()
    .int()
    .refine((v) => v !== 0, { message: 'quantityChange must be nonzero' }),
  reason: z.enum(['damage', 'theft', 'count_correction', 'expired', 'other']),
  notes: z.string().optional(),
});

const auditSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        countedQty: z.number().int().min(0),
      }),
    )
    .min(1),
});

const approveSchema = z.object({
  auditId: z.string().uuid(),
});

// ======================== STOCK ADJUSTMENT ENDPOINTS ========================

stockRouter.post('/adjust', requireRole('owner', 'manager'), validate(adjustSchema), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const input = c.get('validatedBody') as z.infer<typeof adjustSchema>;
  const entry = await stockAdjustmentService.adjustStock(tenantId, userId, input);
  return c.json(success(entry), 201);
});

stockRouter.post('/audit', validate(auditSchema), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const { items } = c.get('validatedBody') as z.infer<typeof auditSchema>;
  const result = await stockAdjustmentService.submitAudit(tenantId, userId, items);
  return c.json(success(result));
});

stockRouter.post('/audit/approve', validate(approveSchema), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const { auditId } = c.get('validatedBody') as z.infer<typeof approveSchema>;
  const result = await stockAdjustmentService.approveAudit(tenantId, userId, auditId);
  return c.json(success(result));
});

// ======================== PRODUCT STOCK ENDPOINTS ========================

stockRouter.get('/:productId', async (c) => {
  const { tenantId } = c.get('tenant');
  const productId = c.req.param('productId')!;
  const data = await stockService.getProductStock(tenantId, productId);
  return c.json(success(data));
});

stockRouter.get('/:productId/history', async (c) => {
  const { tenantId } = c.get('tenant');
  const productId = c.req.param('productId')!;
  const limit = Number(c.req.query('limit')) || 50;
  const offset = Number(c.req.query('offset')) || 0;
  const data = await stockService.getStockHistory(tenantId, productId, limit, offset);
  return c.json(success(data));
});

export default stockRouter;
