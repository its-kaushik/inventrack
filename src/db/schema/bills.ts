import { pgTable, uuid, varchar, decimal, boolean, timestamp, text, integer, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, gstSchemeEnum } from './tenants.js';
import { customers } from './customers.js';
import { users } from './users.js';
import { products } from './products.js';

export const billStatusEnum = pgEnum('bill_status', ['completed', 'returned', 'partially_returned', 'voided', 'held']);
export const paymentModeEnum = pgEnum('payment_mode', ['cash', 'upi', 'card', 'credit']);

export const bills = pgTable('bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  billNumber: varchar('bill_number', { length: 30 }).notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  salespersonId: uuid('salesperson_id').notNull().references(() => users.id),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
  catalogDiscountTotal: decimal('catalog_discount_total', { precision: 12, scale: 2 }).notNull().default('0'),
  additionalDiscountAmount: decimal('additional_discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  additionalDiscountPct: decimal('additional_discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  netAmount: decimal('net_amount', { precision: 12, scale: 2 }).notNull(),
  gstSchemeAtSale: gstSchemeEnum('gst_scheme_at_sale').notNull(),
  status: billStatusEnum('status').notNull().default('completed'),
  isOffline: boolean('is_offline').notNull().default(false),
  offlineCreatedAt: timestamp('offline_created_at', { withTimezone: true }),
  clientId: uuid('client_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_bills_tenant_number').on(table.tenantId, table.billNumber),
  uniqueIndex('idx_bills_tenant_client_id').on(table.tenantId, table.clientId),
  index('idx_bills_tenant_created').on(table.tenantId, table.createdAt),
  index('idx_bills_tenant_customer').on(table.tenantId, table.customerId),
  index('idx_bills_tenant_salesperson').on(table.tenantId, table.salespersonId),
  index('idx_bills_tenant_status').on(table.tenantId, table.status),
]);

export const billItems = pgTable('bill_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  billId: uuid('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  productName: varchar('product_name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 50 }).notNull(),
  hsnCode: varchar('hsn_code', { length: 8 }),
  size: varchar('size', { length: 20 }),
  quantity: integer('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  catalogDiscountPct: decimal('catalog_discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  catalogDiscountAmt: decimal('catalog_discount_amt', { precision: 10, scale: 2 }).notNull().default('0'),
  gstRate: decimal('gst_rate', { precision: 5, scale: 2 }).notNull(),
  cgstAmount: decimal('cgst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  sgstAmount: decimal('sgst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  costPrice: decimal('cost_price', { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal('line_total', { precision: 10, scale: 2 }).notNull(),
  returnedQty: integer('returned_qty').notNull().default(0),
}, (table) => [
  index('idx_bill_items_bill').on(table.billId),
  index('idx_bill_items_product').on(table.productId),
]);

export const billPayments = pgTable('bill_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  billId: uuid('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
  mode: paymentModeEnum('mode').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  reference: varchar('reference', { length: 100 }),
}, (table) => [
  index('idx_bill_payments_bill').on(table.billId),
]);
