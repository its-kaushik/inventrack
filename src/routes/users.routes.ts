import { Hono } from 'hono';
import { z } from 'zod';
import * as userService from '../services/user.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const usersRouter = new Hono<AppEnv>();

// All user routes require auth + owner role
usersRouter.use('*', authMiddleware, tenantScope, requireRole('owner'));

usersRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const data = await userService.listUsers(tenantId);
  return c.json(success(data));
});

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  email: z.string().email().optional(),
  role: z.enum(['owner', 'manager', 'salesperson']),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

usersRouter.post('/', validate(createUserSchema), async (c) => {
  const { tenantId } = c.get('tenant');
  const input = c.get('validatedBody') as z.infer<typeof createUserSchema>;
  const user = await userService.createUser(tenantId, input);
  return c.json(success(user), 201);
});

usersRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const userId = c.req.param('id')!;
  const user = await userService.getUserById(tenantId, userId);
  return c.json(success(user));
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(10).optional(),
  email: z.string().email().optional(),
  role: z.enum(['owner', 'manager', 'salesperson']).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

usersRouter.patch('/:id', validate(updateUserSchema), async (c) => {
  const { tenantId } = c.get('tenant');
  const userId = c.req.param('id')!;
  const patch = c.get('validatedBody') as z.infer<typeof updateUserSchema>;
  const user = await userService.updateUser(tenantId, userId, patch);
  return c.json(success(user));
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

usersRouter.post('/:id/reset-password', validate(resetPasswordSchema), async (c) => {
  const { tenantId } = c.get('tenant');
  const userId = c.req.param('id')!;
  const { newPassword } = c.get('validatedBody') as z.infer<typeof resetPasswordSchema>;
  const result = await userService.resetUserPassword(tenantId, userId, newPassword);
  return c.json(success(result));
});

export default usersRouter;
