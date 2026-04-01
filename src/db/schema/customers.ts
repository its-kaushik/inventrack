import { pgTable, uuid, varchar, text, decimal, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 15 }).notNull(),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  outstandingBalance: decimal('outstanding_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  createdBy: uuid('created_by').references(() => users.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_customers_tenant_phone').on(table.tenantId, table.phone),
  index('idx_customers_tenant').on(table.tenantId),
]);
