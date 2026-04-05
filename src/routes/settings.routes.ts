import { Hono } from 'hono';
import { validate } from '../validators/common.validators.js';
import { updateSettingsSchema, updateGstSchema } from '../validators/settings.validators.js';
import * as settingsService from '../services/settings.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const settingsRoutes = new Hono<AppEnv>();

// GET /settings — Owner and Manager can view
settingsRoutes.get('/', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const settings = await settingsService.getSettings(auth.tenantId);
  return c.json({ data: settings });
});

// PATCH /settings — Owner only
settingsRoutes.patch('/', authorize('owner'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(updateSettingsSchema, await c.req.json());

  // Convert numbers to strings for NUMERIC columns
  const data: Record<string, unknown> = {};
  if (body.defaultBillDiscountPct !== undefined)
    data.defaultBillDiscountPct = String(body.defaultBillDiscountPct);
  if (body.maxDiscountPct !== undefined)
    data.maxDiscountPct = String(body.maxDiscountPct);
  if (body.returnWindowDays !== undefined) data.returnWindowDays = body.returnWindowDays;
  if (body.shelfAgingThresholdDays !== undefined)
    data.shelfAgingThresholdDays = body.shelfAgingThresholdDays;
  if (body.billNumberPrefix !== undefined) data.billNumberPrefix = body.billNumberPrefix;
  if (body.receiptFooterMessage !== undefined) data.receiptFooterMessage = body.receiptFooterMessage;
  if (body.receiptShowReturnPolicy !== undefined)
    data.receiptShowReturnPolicy = body.receiptShowReturnPolicy;
  if (body.voidWindowHours !== undefined) data.voidWindowHours = body.voidWindowHours;

  const settings = await settingsService.updateSettings(auth.tenantId, auth.userId, data);
  return c.json({ data: settings });
});

// GET /settings/gst
settingsRoutes.get('/gst', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const gst = await settingsService.getGstSettings(auth.tenantId);
  return c.json({ data: gst });
});

// PATCH /settings/gst — Owner only
settingsRoutes.patch('/gst', authorize('owner'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(updateGstSchema, await c.req.json());
  const gst = await settingsService.updateGstSettings(auth.tenantId, auth.userId, body);
  return c.json({ data: gst });
});
