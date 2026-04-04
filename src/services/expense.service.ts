import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { db } from '../config/database.js';
import { expenses } from '../db/schema/expenses.js';
import { NotFoundError } from '../lib/errors.js';

const DEFAULT_CATEGORIES = [
  'Rent',
  'Electricity',
  'Salary',
  'Transport',
  'Packaging',
  'Repairs',
  'Miscellaneous',
];

interface CreateExpenseInput {
  category: string;
  amount: number;
  description?: string;
  expenseDate: string;
  isRecurring?: boolean;
  recurrenceInterval?: string;
  receiptImageUrl?: string;
}

export async function createExpense(tenantId: string, userId: string, input: CreateExpenseInput) {
  const [expense] = await db
    .insert(expenses)
    .values({
      tenantId,
      category: input.category,
      amount: String(input.amount),
      description: input.description,
      expenseDate: input.expenseDate,
      isRecurring: input.isRecurring ?? false,
      recurrenceInterval: input.recurrenceInterval,
      receiptImageUrl: input.receiptImageUrl,
      createdBy: userId,
    })
    .returning();

  return expense;
}

export async function listExpenses(
  tenantId: string,
  filters: {
    category?: string;
    from?: string;
    to?: string;
    isRecurring?: boolean;
    limit?: number;
    offset?: number;
  },
) {
  const conditions: any[] = [eq(expenses.tenantId, tenantId)];

  if (filters.category) {
    conditions.push(eq(expenses.category, filters.category));
  }
  if (filters.from) {
    conditions.push(gte(expenses.expenseDate, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(expenses.expenseDate, filters.to));
  }
  if (filters.isRecurring !== undefined) {
    conditions.push(eq(expenses.isRecurring, filters.isRecurring));
  }

  const limit = Math.min(filters.limit || 20, 100);
  const offset = filters.offset || 0;

  const items = await db
    .select()
    .from(expenses)
    .where(and(...conditions))
    .orderBy(desc(expenses.expenseDate))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return { items, hasMore };
}

export async function getExpenseById(tenantId: string, expenseId: string) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
    .limit(1);

  if (!expense) throw new NotFoundError('Expense', expenseId);

  return expense;
}

export async function updateExpense(
  tenantId: string,
  expenseId: string,
  patch: Partial<CreateExpenseInput>,
) {
  // Verify expense exists
  await getExpenseById(tenantId, expenseId);

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (patch.category !== undefined) updateData.category = patch.category;
  if (patch.amount !== undefined) updateData.amount = String(patch.amount);
  if (patch.description !== undefined) updateData.description = patch.description;
  if (patch.expenseDate !== undefined) updateData.expenseDate = patch.expenseDate;
  if (patch.isRecurring !== undefined) updateData.isRecurring = patch.isRecurring;
  if (patch.recurrenceInterval !== undefined)
    updateData.recurrenceInterval = patch.recurrenceInterval;
  if (patch.receiptImageUrl !== undefined) updateData.receiptImageUrl = patch.receiptImageUrl;

  const [updated] = await db
    .update(expenses)
    .set(updateData)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function deleteExpense(tenantId: string, expenseId: string) {
  // Verify expense exists
  await getExpenseById(tenantId, expenseId);

  await db.delete(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)));
}

export async function listCategories(tenantId: string) {
  const dbCategories = (await db.execute(sql`
    SELECT DISTINCT category FROM expenses WHERE tenant_id = ${tenantId}
  `)) as any[];

  const dbSet = new Set(dbCategories.map((r: any) => r.category));
  const allCategories = [...DEFAULT_CATEGORIES];

  for (const cat of dbSet) {
    if (!allCategories.includes(cat)) {
      allCategories.push(cat);
    }
  }

  return allCategories.sort();
}
