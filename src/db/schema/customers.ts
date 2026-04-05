import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 15 }).notNull(),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    notes: text('notes'),
    gstin: varchar('gstin', { length: 15 }),
    clientId: uuid('client_id').unique(), // For offline sync idempotency
    outstandingBalance: numeric('outstanding_balance', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    totalSpend: numeric('total_spend', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    visitCount: integer('visit_count').notNull().default(0),
    lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
    loyaltyPoints: integer('loyalty_points').notNull().default(0), // Reserved Phase 4
    loyaltyTier: varchar('loyalty_tier', { length: 50 }), // Reserved Phase 4
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_customers_tenant_phone').on(table.tenantId, table.phone),
    index('idx_customers_tenant_name').on(table.tenantId, table.name),
    index('idx_customers_tenant_balance').on(table.tenantId, table.outstandingBalance),
  ],
);

export const customerTransactionTypeEnum = pgEnum('customer_transaction_type', [
  'sale_credit',
  'payment',
  'return_adjustment',
  'opening_balance',
]);

export const customerTransactions = pgTable(
  'customer_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    type: customerTransactionTypeEnum('type').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // Positive = they owe more, negative = they owe less
    balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
    referenceType: varchar('reference_type', { length: 50 }),
    referenceId: uuid('reference_id'),
    paymentMode: varchar('payment_mode', { length: 20 }),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_customer_tx_tenant_customer_date').on(
      table.tenantId,
      table.customerId,
      table.createdAt,
    ),
  ],
);
