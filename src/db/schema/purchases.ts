import { pgTable, uuid, varchar, decimal, integer, boolean, date, timestamp, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { suppliers } from './suppliers.js';
import { users } from './users.js';
import { products } from './products.js';
import { text } from 'drizzle-orm/pg-core';

export const poStatusEnum = pgEnum('po_status', ['draft', 'sent', 'partially_received', 'received', 'cancelled']);

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  poNumber: varchar('po_number', { length: 30 }).notNull(),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  status: poStatusEnum('status').notNull().default('draft'),
  expectedTotal: decimal('expected_total', { precision: 12, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_po_tenant_number').on(table.tenantId, table.poNumber),
]);

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  orderedQty: integer('ordered_qty').notNull(),
  receivedQty: integer('received_qty').notNull().default(0),
  expectedCost: decimal('expected_cost', { precision: 10, scale: 2 }).notNull(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  poId: uuid('po_id').references(() => purchaseOrders.id),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  invoiceNumber: varchar('invoice_number', { length: 50 }),
  invoiceDate: date('invoice_date'),
  invoiceImageUrl: varchar('invoice_image_url', { length: 500 }),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
  cgstAmount: decimal('cgst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  sgstAmount: decimal('sgst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  igstAmount: decimal('igst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  isRcm: boolean('is_rcm').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseItems = pgTable('purchase_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseId: uuid('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  costPrice: decimal('cost_price', { precision: 10, scale: 2 }).notNull(),
  gstRate: decimal('gst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  gstAmount: decimal('gst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
});
