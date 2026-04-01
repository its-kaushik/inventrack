import { pgTable, uuid, varchar, decimal, date, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const partyTypeEnum = pgEnum('party_type', ['customer', 'supplier']);
export const ledgerEntryTypeEnum = pgEnum('ledger_entry_type', [
  'sale', 'purchase', 'payment', 'return', 'adjustment', 'opening_balance',
]);
export const generalPaymentModeEnum = pgEnum('general_payment_mode', [
  'cash', 'upi', 'bank_transfer', 'cheque', 'card',
]);

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  partyType: partyTypeEnum('party_type').notNull(),
  partyId: uuid('party_id').notNull(),
  entryType: ledgerEntryTypeEnum('entry_type').notNull(),
  debit: decimal('debit', { precision: 12, scale: 2 }).notNull().default('0'),
  credit: decimal('credit', { precision: 12, scale: 2 }).notNull().default('0'),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  paymentMode: generalPaymentModeEnum('payment_mode'),
  paymentReference: varchar('payment_reference', { length: 100 }),
  dueDate: date('due_date'),
  description: varchar('description', { length: 255 }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_ledger_party').on(table.tenantId, table.partyType, table.partyId, table.createdAt),
]);
