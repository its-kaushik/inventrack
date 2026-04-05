import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  timestamp,
  index,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 255 }).notNull(),
    contactPerson: varchar('contact_person', { length: 255 }),
    phone: varchar('phone', { length: 15 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    gstin: varchar('gstin', { length: 15 }),
    pan: varchar('pan', { length: 10 }),
    bankDetails: jsonb('bank_details'), // { account_no, ifsc, bank_name }
    paymentTerms: varchar('payment_terms', { length: 50 }).notNull().default('cod'),
    outstandingBalance: numeric('outstanding_balance', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_suppliers_tenant_name').on(table.tenantId, table.name),
    index('idx_suppliers_tenant_active').on(table.tenantId, table.isActive),
  ],
);

export const supplierTransactionTypeEnum = pgEnum('supplier_transaction_type', [
  'purchase_credit',
  'payment',
  'return_adjustment',
  'opening_balance',
]);

export const supplierTransactions = pgTable(
  'supplier_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    type: supplierTransactionTypeEnum('type').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // Positive = we owe more, negative = we owe less
    balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
    referenceType: varchar('reference_type', { length: 50 }),
    referenceId: uuid('reference_id'),
    paymentMode: varchar('payment_mode', { length: 20 }), // cash, upi, bank_transfer, cheque
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_supplier_tx_tenant_supplier_date').on(
      table.tenantId,
      table.supplierId,
      table.createdAt,
    ),
  ],
);
