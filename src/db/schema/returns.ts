import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  numeric,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';
import { customers } from './customers.js';
import { sales, saleItems } from './sales.js';
import { productVariants } from './products.js';

export const returnTypeEnum = pgEnum('return_type', ['full', 'partial', 'exchange']);
export const refundModeEnum = pgEnum('refund_mode', ['cash', 'khata', 'exchange', 'store_credit']);
export const returnReasonEnum = pgEnum('return_reason', [
  'size_issue',
  'defect',
  'changed_mind',
  'color_mismatch',
  'other',
]);

export const salesReturns = pgTable('sales_returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  returnNumber: varchar('return_number', { length: 50 }).notNull(),
  originalSaleId: uuid('original_sale_id')
    .notNull()
    .references(() => sales.id),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  returnType: returnTypeEnum('return_type').notNull(),
  totalRefundAmount: numeric('total_refund_amount', { precision: 12, scale: 2 }).notNull(),
  refundMode: refundModeEnum('refund_mode').notNull(),
  khataAdjustment: numeric('khata_adjustment', { precision: 12, scale: 2 }).notNull().default('0'),
  cashRefund: numeric('cash_refund', { precision: 12, scale: 2 }).notNull().default('0'),
  exchangeSaleId: uuid('exchange_sale_id').references(() => sales.id),
  isWithinWindow: boolean('is_within_window').notNull(),
  overrideBy: uuid('override_by').references(() => users.id),
  processedBy: uuid('processed_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const salesReturnItems = pgTable('sales_return_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  salesReturnId: uuid('sales_return_id')
    .notNull()
    .references(() => salesReturns.id, { onDelete: 'cascade' }),
  saleItemId: uuid('sale_item_id').references(() => saleItems.id),
  variantId: uuid('variant_id').references(() => productVariants.id),
  quantity: integer('quantity').notNull(),
  refundAmount: numeric('refund_amount', { precision: 12, scale: 2 }).notNull(),
  reason: returnReasonEnum('reason').notNull(),
});
