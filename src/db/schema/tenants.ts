import { pgTable, uuid, varchar, text, smallint, boolean, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const gstSchemeEnum = pgEnum('gst_scheme_type', ['regular', 'composition']);
export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'deleted']);
export const tenantPlanEnum = pgEnum('tenant_plan', ['free', 'basic', 'pro']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  phone: varchar('phone', { length: 15 }),
  email: varchar('email', { length: 255 }),
  logoUrl: varchar('logo_url', { length: 500 }),
  gstin: varchar('gstin', { length: 15 }),
  gstScheme: gstSchemeEnum('gst_scheme').notNull().default('regular'),
  financialYearStart: smallint('financial_year_start').notNull().default(4),
  invoicePrefix: varchar('invoice_prefix', { length: 10 }).notNull().default('INV'),
  settings: jsonb('settings').notNull().default({}),
  setupComplete: boolean('setup_complete').notNull().default(false),
  status: tenantStatusEnum('status').notNull().default('active'),
  plan: tenantPlanEnum('plan').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
