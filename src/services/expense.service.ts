import { eq, and, isNull, desc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { expenses, expenseCategories } from '../db/schema/expenses.js';
import { AppError } from '../types/errors.js';

// ── Categories ──

export async function listCategories(tenantId: string) {
  return db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.tenantId, tenantId))
    .orderBy(expenseCategories.name);
}

export async function createCategory(tenantId: string, name: string) {
  const [cat] = await db
    .insert(expenseCategories)
    .values({ tenantId, name })
    .returning();
  return cat;
}

// ── Expenses ──

export async function createExpense(
  tenantId: string,
  userId: string,
  data: {
    date: string;
    amount: number;
    categoryId?: string;
    paymentMode: 'cash' | 'upi' | 'bank_transfer';
    notes?: string;
    receiptUrl?: string;
  },
) {
  const [expense] = await db
    .insert(expenses)
    .values({
      tenantId,
      date: data.date,
      amount: String(data.amount),
      categoryId: data.categoryId ?? null,
      paymentMode: data.paymentMode,
      notes: data.notes ?? null,
      receiptUrl: data.receiptUrl ?? null,
      createdBy: userId,
    })
    .returning();
  return expense;
}

export async function listExpenses(
  tenantId: string,
  opts?: { month?: string; page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(expenses.tenantId, tenantId), isNull(expenses.deletedAt)];

  if (opts?.month) {
    // month format: '2026-04'
    conditions.push(sql`to_char(${expenses.date}, 'YYYY-MM') = ${opts.month}`);
  }

  const where = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db.select().from(expenses).where(where).orderBy(desc(expenses.date)).limit(limit).offset(offset),
    db.select({ total: count() }).from(expenses).where(where),
  ]);

  // Calculate total for the period
  const [sumResult] = await db
    .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` })
    .from(expenses)
    .where(where);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page,
    limit,
    periodTotal: Number(sumResult?.total ?? 0),
  };
}

export async function getExpenseById(tenantId: string, expenseId: string) {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId), isNull(expenses.deletedAt)));
  if (!expense) throw new AppError('NOT_FOUND', 'Expense not found', 404);
  return expense;
}

export async function updateExpense(
  tenantId: string,
  expenseId: string,
  data: Record<string, unknown>,
) {
  const [updated] = await db
    .update(expenses)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId), isNull(expenses.deletedAt)))
    .returning();
  if (!updated) throw new AppError('NOT_FOUND', 'Expense not found', 404);
  return updated;
}

export async function deleteExpense(tenantId: string, expenseId: string) {
  const [deleted] = await db
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId), isNull(expenses.deletedAt)))
    .returning({ id: expenses.id });
  if (!deleted) throw new AppError('NOT_FOUND', 'Expense not found', 404);
}
