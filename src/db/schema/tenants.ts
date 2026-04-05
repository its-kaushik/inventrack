import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const gstSchemeEnum = pgEnum('gst_scheme', ['composite', 'regular']);
export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'deleted']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  phone: varchar('phone', { length: 15 }),
  email: varchar('email', { length: 255 }),
  gstin: varchar('gstin', { length: 15 }),
  logoUrl: text('logo_url'),
  gstScheme: gstSchemeEnum('gst_scheme').notNull().default('composite'),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  status: tenantStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    defaultBillDiscountPct: numeric('default_bill_discount_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('15.00'),
    maxDiscountPct: numeric('max_discount_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('30.00'),
    returnWindowDays: integer('return_window_days').notNull().default(7),
    shelfAgingThresholdDays: integer('shelf_aging_threshold_days').notNull().default(90),
    billNumberPrefix: varchar('bill_number_prefix', { length: 10 }).notNull().default('INV'),
    receiptFooterMessage: text('receipt_footer_message').notNull().default(
      'Thank you for shopping with us!',
    ),
    receiptShowReturnPolicy: boolean('receipt_show_return_policy').notNull().default(true),
    voidWindowHours: integer('void_window_hours').notNull().default(24),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_tenant_settings_tenant').on(table.tenantId)],
);
