import { Hono } from 'hono';
import { z } from 'zod';
import * as cashRegisterService from '../services/cash-register.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const cashRegisterRouter = new Hono<AppEnv>();
cashRegisterRouter.use('*', authMiddleware, tenantScope);

cashRegisterRouter.post('/open', validate(z.object({
  openingBalance: z.number().min(0),
})), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const { openingBalance } = c.get('validatedBody') as { openingBalance: number };
  const register = await cashRegisterService.openRegister(tenantId, userId, openingBalance);
  return c.json(success(register), 201);
});

cashRegisterRouter.get('/current', async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const register = await cashRegisterService.getCurrentRegister(tenantId, userId);
  return c.json(success(register));
});

cashRegisterRouter.get('/history', async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const limit = Number(c.req.query('limit')) || 20;
  const offset = Number(c.req.query('offset')) || 0;
  const data = await cashRegisterService.getRegisterHistory(tenantId, userId, limit, offset);
  return c.json(success(data));
});

cashRegisterRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const register = await cashRegisterService.getRegisterById(tenantId, c.req.param('id')!);
  return c.json(success(register));
});

cashRegisterRouter.post('/:id/close', validate(z.object({
  actualClosing: z.number().min(0),
})), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const { actualClosing } = c.get('validatedBody') as { actualClosing: number };
  const register = await cashRegisterService.closeRegister(tenantId, userId, c.req.param('id')!, actualClosing);
  return c.json(success(register));
});

export default cashRegisterRouter;
