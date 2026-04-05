import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';
import { customers } from './customers.js';
import { productVariants } from './products.js';

// ── Sales ──

export const saleStatusEnum = pgEnum('sale_status', [
  'completed',
  'cancelled',
  'returned',
  'partially_returned',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'upi', 'card', 'credit']);

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billNumber: varchar('bill_number', { length: 50 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    subtotalMrp: numeric('subtotal_mrp', { precision: 12, scale: 2 }).notNull(),
    productDiscountTotal: numeric('product_discount_total', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    billDiscountPct: numeric('bill_discount_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    billDiscountAmount: numeric('bill_discount_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    bargainAdjustment: numeric('bargain_adjustment', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    effectiveDiscountPct: numeric('effective_discount_pct', { precision: 5, scale: 2 }).notNull(),
    subtotalTaxable: numeric('subtotal_taxable', { precision: 12, scale: 2 }).notNull(),
    totalCgst: numeric('total_cgst', { precision: 12, scale: 2 }).notNull().default('0'),
    totalSgst: numeric('total_sgst', { precision: 12, scale: 2 }).notNull().default('0'),
    totalIgst: numeric('total_igst', { precision: 12, scale: 2 }).notNull().default('0'),
    roundOff: numeric('round_off', { precision: 5, scale: 2 }).notNull().default('0'),
    netPayable: numeric('net_payable', { precision: 12, scale: 2 }).notNull(),
    totalCogs: numeric('total_cogs', { precision: 12, scale: 2 }).notNull(),
    status: saleStatusEnum('status').notNull().default('completed'),
    channel: varchar('channel', { length: 20 }).notNull().default('in_store'),
    gstScheme: varchar('gst_scheme', { length: 20 }).notNull(),
    billedBy: uuid('billed_by')
      .notNull()
      .references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    voidReason: text('void_reason'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    clientId: uuid('client_id').unique(),
    isOffline: boolean('is_offline').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_sales_tenant_bill').on(table.tenantId, table.billNumber),
    index('idx_sales_tenant_customer').on(table.tenantId, table.customerId),
    index('idx_sales_tenant_created').on(table.tenantId, table.createdAt),
    index('idx_sales_tenant_status').on(table.tenantId, table.status),
    index('idx_sales_tenant_channel').on(table.tenantId, table.channel),
  ],
);

export const saleItems = pgTable('sale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => productVariants.id),
  productName: varchar('product_name', { length: 500 }).notNull(),
  variantDescription: varchar('variant_description', { length: 255 }),
  quantity: integer('quantity').notNull(),
  mrp: numeric('mrp', { precision: 12, scale: 2 }).notNull(),
  productDiscountPct: numeric('product_discount_pct', { precision: 5, scale: 2 })
    .notNull()
    .default('0'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  costAtSale: numeric('cost_at_sale', { precision: 12, scale: 2 }).notNull(),
  hsnCode: varchar('hsn_code', { length: 8 }),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  cgstAmount: numeric('cgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  sgstAmount: numeric('sgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  igstAmount: numeric('igst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
});

export const salePayments = pgTable('sale_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
});

// ── Parked Bills ──

export const parkedBills = pgTable('parked_bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  customerId: uuid('customer_id').references(() => customers.id),
  cartData: jsonb('cart_data').notNull(),
  parkedBy: uuid('parked_by').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Bill Number Sequences ──

export const billNumberSequences = pgTable(
  'bill_number_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    financialYear: varchar('financial_year', { length: 5 }).notNull(),
    prefix: varchar('prefix', { length: 10 }).notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (table) => [
    uniqueIndex('idx_bill_seq_tenant_fy_prefix').on(
      table.tenantId,
      table.financialYear,
      table.prefix,
    ),
  ],
);
