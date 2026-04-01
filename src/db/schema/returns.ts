import { pgTable, uuid, varchar, decimal, integer, timestamp, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { bills, billItems } from './bills.js';
import { users } from './users.js';

export const refundModeEnum = pgEnum('refund_mode', ['cash', 'credit_note', 'exchange']);

export const returns = pgTable('returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  originalBillId: uuid('original_bill_id').notNull().references(() => bills.id),
  returnNumber: varchar('return_number', { length: 30 }).notNull(),
  refundMode: refundModeEnum('refund_mode').notNull(),
  refundAmount: decimal('refund_amount', { precision: 10, scale: 2 }).notNull(),
  reason: varchar('reason', { length: 255 }),
  processedBy: uuid('processed_by').notNull().references(() => users.id),
  exchangeBillId: uuid('exchange_bill_id').references(() => bills.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_returns_tenant_number').on(table.tenantId, table.returnNumber),
]);

export const returnItems = pgTable('return_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  returnId: uuid('return_id').notNull().references(() => returns.id, { onDelete: 'cascade' }),
  billItemId: uuid('bill_item_id').notNull().references(() => billItems.id),
  quantity: integer('quantity').notNull(),
  refundAmount: decimal('refund_amount', { precision: 10, scale: 2 }).notNull(),
});
