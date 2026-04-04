import { Hono } from 'hono';
import { z } from 'zod';
import * as expenseService from '../services/expense.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success, paginated } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const expensesRouter = new Hono<AppEnv>();

expensesRouter.use('*', authMiddleware, tenantScope, requireRole('owner', 'manager'));

// GET /categories must be BEFORE /:id
expensesRouter.get('/categories', async (c) => {
  const { tenantId } = c.get('tenant');
  const categories = await expenseService.listCategories(tenantId);
  return c.json(success(categories));
});

expensesRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    category: c.req.query('category'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    isRecurring:
      c.req.query('is_recurring') !== undefined
        ? c.req.query('is_recurring') === 'true'
        : undefined,
    limit: Number(c.req.query('limit')) || 20,
    offset: Number(c.req.query('offset')) || 0,
  };
  const result = await expenseService.listExpenses(tenantId, filters);
  return c.json(paginated(result.items, result.hasMore ? 'next' : null, result.hasMore));
});

const createExpenseSchema = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().optional(),
  expenseDate: z.string(),
  isRecurring: z.boolean().optional(),
  recurrenceInterval: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  receiptImageUrl: z.string().url().optional(),
});

expensesRouter.post('/', validate(createExpenseSchema), async (c) => {
  const { tenantId, userId } = c.get('tenant');
  const input = c.get('validatedBody') as z.infer<typeof createExpenseSchema>;
  const expense = await expenseService.createExpense(tenantId, userId, input);
  return c.json(success(expense), 201);
});

expensesRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const expense = await expenseService.getExpenseById(tenantId, id);
  return c.json(success(expense));
});

const updateExpenseSchema = z
  .object({
    category: z.string().min(1).optional(),
    amount: z.number().positive().optional(),
    description: z.string().optional(),
    expenseDate: z.string().optional(),
    isRecurring: z.boolean().optional(),
    recurrenceInterval: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
    receiptImageUrl: z.string().url().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

expensesRouter.put('/:id', validate(updateExpenseSchema), async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const patch = c.get('validatedBody') as any;
  const expense = await expenseService.updateExpense(tenantId, id, patch);
  return c.json(success(expense));
});

expensesRouter.delete('/:id', async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  await expenseService.deleteExpense(tenantId, id);
  return c.json(success({ deleted: true }));
});

export default expensesRouter;
