import {
  pgTable,
  uuid,
  numeric,
  date,
  timestamp,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const cashRegisterStatusEnum = pgEnum('cash_register_status', ['open', 'closed']);

export const cashRegisters = pgTable(
  'cash_registers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    date: date('date').notNull(),
    openingBalance: numeric('opening_balance', { precision: 12, scale: 2 }).notNull(),
    closingBalance: numeric('closing_balance', { precision: 12, scale: 2 }),
    actualClosing: numeric('actual_closing', { precision: 12, scale: 2 }),
    discrepancy: numeric('discrepancy', { precision: 12, scale: 2 }),
    status: cashRegisterStatusEnum('status').notNull().default('open'),
    openedBy: uuid('opened_by').references(() => users.id),
    closedBy: uuid('closed_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_cash_register_tenant_date').on(table.tenantId, table.date)],
);
