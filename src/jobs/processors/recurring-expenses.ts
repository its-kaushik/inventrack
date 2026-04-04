import { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { expenses } from '../../db/schema/expenses.js';
import { logger } from '../../lib/logger.js';

export default async function processRecurringExpenses(job: Job) {
  logger.info({ jobId: job.id }, 'Running recurring expenses processor');

  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth() + 1; // 1-based
  const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

  // Get all active tenants
  const tenants = (await db.execute(sql`
    SELECT id FROM tenants WHERE status = 'active'
  `)) as any[];

  for (const tenant of tenants) {
    const tenantId = tenant.id;

    // Find recurring expenses for this tenant
    const recurringExpenses = (await db.execute(sql`
      SELECT id, category, amount, description, expense_date, recurrence_interval, created_by
      FROM expenses
      WHERE tenant_id = ${tenantId}
        AND is_recurring = true
        AND recurrence_interval IS NOT NULL
    `)) as any[];

    for (const expense of recurringExpenses) {
      const expenseDate = new Date(expense.expense_date);
      const expenseDay = expenseDate.getDate();
      const expenseMonth = expenseDate.getMonth() + 1;

      let shouldCreate = false;

      if (expense.recurrence_interval === 'monthly') {
        // Create if today's day matches the expense's original day
        shouldCreate = todayDay === expenseDay;
      } else if (expense.recurrence_interval === 'quarterly') {
        // Create if month difference is a multiple of 3 AND day matches
        const monthDiff = (todayMonth - expenseMonth + 12) % 12;
        shouldCreate = monthDiff % 3 === 0 && todayDay === expenseDay;
      } else if (expense.recurrence_interval === 'yearly') {
        // Create if month and day both match
        shouldCreate = todayMonth === expenseMonth && todayDay === expenseDay;
      }

      if (!shouldCreate) continue;

      // Idempotency check: does an expense with same category, amount, description exist for today?
      const [existing] = (await db.execute(sql`
        SELECT id FROM expenses
        WHERE tenant_id = ${tenantId}
          AND category = ${expense.category}
          AND amount = ${expense.amount}
          AND expense_date = ${todayStr}::date
          AND COALESCE(description, '') = COALESCE(${expense.description}, '')
        LIMIT 1
      `)) as any[];

      if (existing) {
        logger.info(
          { tenantId, category: expense.category },
          'Recurring expense already exists for today, skipping',
        );
        continue;
      }

      // Insert new expense instance
      await db.insert(expenses).values({
        tenantId,
        category: expense.category,
        amount: expense.amount,
        description: expense.description,
        expenseDate: todayStr,
        isRecurring: false,
        recurrenceInterval: null,
        receiptImageUrl: null,
        createdBy: expense.created_by,
      });

      logger.info(
        { tenantId, category: expense.category, amount: expense.amount },
        'Created recurring expense instance',
      );
    }
  }
}
