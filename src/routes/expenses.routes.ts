import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseListQuerySchema,
  createCategorySchema,
} from '../validators/expense.validators.js';
import * as expenseService from '../services/expense.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const expenseRoutes = new Hono<AppEnv>();

// All expense routes: Owner, Manager only
expenseRoutes.use('*', authorize('owner', 'manager'));

// GET /expenses
expenseRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = validate(expenseListQuerySchema, c.req.query());
  const result = await expenseService.listExpenses(auth.tenantId, query);
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit, periodTotal: result.periodTotal },
  });
});

// POST /expenses
expenseRoutes.post('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createExpenseSchema, await c.req.json());
  const expense = await expenseService.createExpense(auth.tenantId, auth.userId, body);
  return c.json({ data: expense }, 201);
});

// ── Category routes BEFORE /:id to avoid route collision ──

// GET /expenses/categories
expenseRoutes.get('/categories', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const cats = await expenseService.listCategories(auth.tenantId);
  return c.json({ data: cats });
});

// POST /expenses/categories
expenseRoutes.post('/categories', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createCategorySchema, await c.req.json());
  const cat = await expenseService.createCategory(auth.tenantId, body.name);
  return c.json({ data: cat }, 201);
});

// ── Parameterized routes AFTER specific routes ──

// GET /expenses/:id
expenseRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const expense = await expenseService.getExpenseById(auth.tenantId, id);
  return c.json({ data: expense });
});

// PATCH /expenses/:id
expenseRoutes.patch('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(updateExpenseSchema, await c.req.json());
  const expense = await expenseService.updateExpense(auth.tenantId, id, body);
  return c.json({ data: expense });
});

// DELETE /expenses/:id
expenseRoutes.delete('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  await expenseService.deleteExpense(auth.tenantId, id);
  return c.json({ data: { message: 'Expense deleted' } });
});
