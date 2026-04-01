import { pgTable, uuid, varchar, text, decimal, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  contactPerson: varchar('contact_person', { length: 255 }),
  phone: varchar('phone', { length: 15 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  gstin: varchar('gstin', { length: 15 }),
  paymentTerms: varchar('payment_terms', { length: 100 }),
  notes: text('notes'),
  outstandingBalance: decimal('outstanding_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_suppliers_tenant').on(table.tenantId),
]);
