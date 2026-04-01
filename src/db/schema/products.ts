import { pgTable, uuid, varchar, text, integer, decimal, boolean, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { categories, subTypes } from './categories.js';
import { brands } from './brands.js';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 50 }).notNull(),
  barcode: varchar('barcode', { length: 50 }),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  subTypeId: uuid('sub_type_id').references(() => subTypes.id),
  brandId: uuid('brand_id').references(() => brands.id),
  size: varchar('size', { length: 20 }),
  color: varchar('color', { length: 50 }),
  hsnCode: varchar('hsn_code', { length: 8 }),
  gstRate: decimal('gst_rate', { precision: 5, scale: 2 }).notNull().default('5.00'),
  sellingPrice: decimal('selling_price', { precision: 10, scale: 2 }).notNull(),
  costPrice: decimal('cost_price', { precision: 10, scale: 2 }).notNull().default('0'),
  mrp: decimal('mrp', { precision: 10, scale: 2 }),
  catalogDiscountPct: decimal('catalog_discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  minStockLevel: integer('min_stock_level').notNull().default(10),
  reorderPoint: integer('reorder_point'),
  description: text('description'),
  imageUrls: jsonb('image_urls').notNull().default([]),
  currentStock: integer('current_stock').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_products_tenant_sku').on(table.tenantId, table.sku),
  uniqueIndex('idx_products_tenant_barcode').on(table.tenantId, table.barcode),
  index('idx_products_tenant_category').on(table.tenantId, table.categoryId),
  index('idx_products_tenant_brand').on(table.tenantId, table.brandId),
  index('idx_products_tenant_active').on(table.tenantId, table.isActive),
]);
