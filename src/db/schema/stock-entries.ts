import { pgTable, uuid, varchar, integer, decimal, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { products } from './products.js';
import { users } from './users.js';

export const stockEntryTypeEnum = pgEnum('stock_entry_type', [
  'purchase', 'sale', 'return_customer', 'return_supplier', 'adjustment', 'opening',
]);

export const stockEntries = pgTable('stock_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  type: stockEntryTypeEnum('type').notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  costPriceAtEntry: decimal('cost_price_at_entry', { precision: 10, scale: 2 }),
  reason: varchar('reason', { length: 255 }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_stock_entries_product').on(table.tenantId, table.productId),
  index('idx_stock_entries_created').on(table.tenantId, table.createdAt),
]);
