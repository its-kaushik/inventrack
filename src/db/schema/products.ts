import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// --- Categories ---

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 255 }).notNull(),
    parentId: uuid('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_categories_tenant_parent').on(table.tenantId, table.parentId),
    uniqueIndex('idx_categories_tenant_name_parent').on(table.tenantId, table.name, table.parentId),
  ],
);

// --- Brands ---

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_brands_tenant_name').on(table.tenantId, table.name)],
);

// --- Attribute Types & Values ---

export const attributeTypes = pgTable(
  'attribute_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 100 }).notNull(),
    isStandard: boolean('is_standard').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_attr_types_tenant_name').on(table.tenantId, table.name)],
);

export const attributeValues = pgTable(
  'attribute_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    attributeTypeId: uuid('attribute_type_id')
      .notNull()
      .references(() => attributeTypes.id),
    value: varchar('value', { length: 100 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_attr_values_tenant_type_val').on(
      table.tenantId,
      table.attributeTypeId,
      table.value,
    ),
  ],
);

// --- Products ---

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 500 }).notNull(),
    brandId: uuid('brand_id').references(() => brands.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    hsnCode: varchar('hsn_code', { length: 8 }),
    description: text('description'),
    hasVariants: boolean('has_variants').notNull().default(true),
    defaultCostPrice: numeric('default_cost_price', { precision: 12, scale: 2 }),
    defaultMrp: numeric('default_mrp', { precision: 12, scale: 2 }),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }),
    productDiscountPct: numeric('product_discount_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_products_tenant_name').on(table.tenantId, table.name),
    index('idx_products_tenant_category').on(table.tenantId, table.categoryId),
    index('idx_products_tenant_brand').on(table.tenantId, table.brandId),
    index('idx_products_tenant_archived').on(table.tenantId, table.isArchived),
  ],
);

// --- Product Variants ---

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    sku: varchar('sku', { length: 100 }).notNull(),
    barcode: varchar('barcode', { length: 100 }).notNull(),
    costPrice: numeric('cost_price', { precision: 12, scale: 2 }).notNull(),
    weightedAvgCost: numeric('weighted_avg_cost', { precision: 12, scale: 2 }).notNull(),
    mrp: numeric('mrp', { precision: 12, scale: 2 }).notNull(),
    availableQuantity: integer('available_quantity').notNull().default(0),
    reservedQuantity: integer('reserved_quantity').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold'),
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_variants_tenant_sku').on(table.tenantId, table.sku),
    uniqueIndex('idx_variants_tenant_barcode').on(table.tenantId, table.barcode),
    index('idx_variants_tenant_product').on(table.tenantId, table.productId),
    index('idx_variants_tenant_quantity').on(table.tenantId, table.availableQuantity),
  ],
);

// --- Variant ↔ Attribute Values (junction) ---

export const variantAttributeValues = pgTable(
  'variant_attribute_values',
  {
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    attributeValueId: uuid('attribute_value_id')
      .notNull()
      .references(() => attributeValues.id),
  },
  (table) => [primaryKey({ columns: [table.variantId, table.attributeValueId] })],
);

// --- Product Images ---

export const productImages = pgTable('product_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  variantId: uuid('variant_id').references(() => productVariants.id),
  imageUrl: text('image_url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  mediumUrl: text('medium_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Inventory Movements ---

export const movementTypeEnum = pgEnum('movement_type', [
  'purchase',
  'sale',
  'sale_return',
  'purchase_return',
  'adjustment',
  'opening_balance',
]);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    movementType: movementTypeEnum('movement_type').notNull(),
    quantity: integer('quantity').notNull(),
    referenceType: varchar('reference_type', { length: 50 }),
    referenceId: uuid('reference_id'),
    costPriceAtMovement: numeric('cost_price_at_movement', { precision: 12, scale: 2 }),
    balanceAfter: integer('balance_after').notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_movements_tenant_variant_date').on(table.tenantId, table.variantId, table.createdAt),
    index('idx_movements_tenant_ref').on(table.tenantId, table.referenceType, table.referenceId),
  ],
);
