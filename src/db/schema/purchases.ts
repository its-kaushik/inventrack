import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';
import { suppliers } from './suppliers.js';
import { productVariants } from './products.js';

// ── Goods Receipts ──

export const receiptPaymentModeEnum = pgEnum('receipt_payment_mode', ['paid', 'credit', 'partial']);

export const goodsReceipts = pgTable(
  'goods_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    receiptNumber: varchar('receipt_number', { length: 50 }).notNull(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    purchaseOrderId: uuid('purchase_order_id'), // NULL for direct purchase. FK added in M7b.
    supplierInvoiceNo: varchar('supplier_invoice_no', { length: 100 }),
    supplierInvoiceDate: date('supplier_invoice_date'),
    supplierInvoiceUrl: text('supplier_invoice_url'),
    paymentMode: receiptPaymentModeEnum('payment_mode').notNull(),
    amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    totalGst: numeric('total_gst', { precision: 12, scale: 2 }).notNull().default('0'),
    paymentDueDate: date('payment_due_date'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_receipts_tenant_number').on(table.tenantId, table.receiptNumber),
    index('idx_receipts_tenant_supplier').on(table.tenantId, table.supplierId),
  ],
);

export const goodsReceiptItems = pgTable('goods_receipt_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  goodsReceiptId: uuid('goods_receipt_id')
    .notNull()
    .references(() => goodsReceipts.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id),
  quantity: integer('quantity').notNull(),
  costPrice: numeric('cost_price', { precision: 12, scale: 2 }).notNull(),
  cgstAmount: numeric('cgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  sgstAmount: numeric('sgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  igstAmount: numeric('igst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
});

// ── Purchase Returns ──

export const purchaseReturns = pgTable('purchase_returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  returnNumber: varchar('return_number', { length: 50 }).notNull(),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  goodsReceiptId: uuid('goods_receipt_id').references(() => goodsReceipts.id),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseReturnItems = pgTable('purchase_return_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseReturnId: uuid('purchase_return_id')
    .notNull()
    .references(() => purchaseReturns.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id),
  quantity: integer('quantity').notNull(),
  costPrice: numeric('cost_price', { precision: 12, scale: 2 }).notNull(),
});
