import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import { inviteUserSchema, updateUserSchema } from '../validators/auth.validators.js';
import * as authService from '../services/auth.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const userRoutes = new Hono<AppEnv>();

// All user routes require owner or manager role
userRoutes.use('*', authorize('owner', 'manager'));

// GET /users — list tenant users
userRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const users = await authService.listUsers(auth.tenantId);
  return c.json({ data: users });
});

// POST /users/invite — invite new staff
userRoutes.post('/invite', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(inviteUserSchema, await c.req.json());
  const user = await authService.createUser({ ...body, tenantId: auth.tenantId });
  const { passwordHash, ownerPinHash, ...safeUser } = user;
  return c.json({ data: safeUser }, 201);
});

// GET /users/:id
userRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const user = await authService.getUserById(auth.tenantId, id);
  return c.json({ data: user });
});

// PATCH /users/:id — update role, status, etc.
userRoutes.patch('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(updateUserSchema, await c.req.json());
  const user = await authService.updateUser(auth.tenantId, id, body);
  const { passwordHash, ownerPinHash, ...safeUser } = user;
  return c.json({ data: safeUser });
});

// DELETE /users/:id — deactivate (soft delete)
userRoutes.delete('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  await authService.deactivateUser(auth.tenantId, id);
  return c.json({ data: { message: 'User deactivated' } });
});
