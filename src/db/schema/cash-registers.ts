import {
  pgTable,
  uuid,
  varchar,
  decimal,
  date,
  timestamp,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const registerStatusEnum = pgEnum('register_status', ['open', 'closed']);
export const cashRegisterEntryTypeEnum = pgEnum('cash_register_entry_type', [
  'cash_sale',
  'credit_collection',
  'petty_expense',
  'supplier_payment',
]);

export const cashRegisters = pgTable(
  'cash_registers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    registerDate: date('register_date').notNull(),
    openingBalance: decimal('opening_balance', { precision: 10, scale: 2 }).notNull(),
    calculatedClosing: decimal('calculated_closing', { precision: 10, scale: 2 }),
    actualClosing: decimal('actual_closing', { precision: 10, scale: 2 }),
    discrepancy: decimal('discrepancy', { precision: 10, scale: 2 }),
    status: registerStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_cash_registers_user').on(table.tenantId, table.userId, table.registerDate),
  ],
);

export const cashRegisterEntries = pgTable('cash_register_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  registerId: uuid('register_id')
    .notNull()
    .references(() => cashRegisters.id, { onDelete: 'cascade' }),
  type: cashRegisterEntryTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  description: varchar('description', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
