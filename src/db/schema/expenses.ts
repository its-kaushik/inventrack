import { pgTable, uuid, varchar, decimal, boolean, date, timestamp, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 100 }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  description: varchar('description', { length: 255 }),
  expenseDate: date('expense_date').notNull(),
  isRecurring: boolean('is_recurring').notNull().default(false),
  recurrenceInterval: varchar('recurrence_interval', { length: 20 }),
  receiptImageUrl: varchar('receipt_image_url', { length: 500 }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
