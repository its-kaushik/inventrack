import { Hono } from 'hono';
import { validate } from '../validators/common.validators.js';
import { openRegisterSchema, closeRegisterSchema } from '../validators/expense.validators.js';
import * as cashRegisterService from '../services/cash-register.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const cashRegisterRoutes = new Hono<AppEnv>();

// All cash register routes: Owner, Manager only
cashRegisterRoutes.use('*', authorize('owner', 'manager'));

// POST /cash-register/open
cashRegisterRoutes.post('/open', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(openRegisterSchema, await c.req.json());
  const register = await cashRegisterService.openRegister(auth.tenantId, auth.userId, body.openingBalance);
  return c.json({ data: register }, 201);
});

// POST /cash-register/close
cashRegisterRoutes.post('/close', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(closeRegisterSchema, await c.req.json());
  const register = await cashRegisterService.closeRegister(auth.tenantId, auth.userId, body.actualClosing);
  return c.json({ data: register });
});

// GET /cash-register/current
cashRegisterRoutes.get('/current', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const register = await cashRegisterService.getCurrentRegister(auth.tenantId);
  return c.json({ data: register });
});

// GET /cash-register/:date
cashRegisterRoutes.get('/:date', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const date = c.req.param('date');
  const register = await cashRegisterService.getRegisterByDate(auth.tenantId, date);
  return c.json({ data: register });
});
