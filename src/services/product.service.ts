import { eq, and, or, gt, desc, sql, ilike } from 'drizzle-orm';
import { db } from '../config/database.js';
import { products } from '../db/schema/products.js';
import { NotFoundError, DuplicateEntryError } from '../lib/errors.js';
import type { UserRole } from '../types/enums.js';

interface ProductFilters {
  categoryId?: string;
  brandId?: string;
  isActive?: boolean;
  search?: string;
  updatedAfter?: string;
  limit?: number;
  offset?: number;
}

const allColumns = {
  id: products.id,
  tenantId: products.tenantId,
  name: products.name,
  sku: products.sku,
  barcode: products.barcode,
  categoryId: products.categoryId,
  subTypeId: products.subTypeId,
  brandId: products.brandId,
  size: products.size,
  color: products.color,
  hsnCode: products.hsnCode,
  gstRate: products.gstRate,
  sellingPrice: products.sellingPrice,
  costPrice: products.costPrice,
  mrp: products.mrp,
  catalogDiscountPct: products.catalogDiscountPct,
  minStockLevel: products.minStockLevel,
  reorderPoint: products.reorderPoint,
  description: products.description,
  imageUrls: products.imageUrls,
  currentStock: products.currentStock,
  isActive: products.isActive,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

function stripCostPrice(product: Record<string, unknown>) {
  const { costPrice, ...rest } = product;
  return rest;
}

export function serializeProduct(product: Record<string, unknown>, role: UserRole) {
  if (role === 'salesperson') return stripCostPrice(product);
  return product;
}

export function serializeProducts(items: Record<string, unknown>[], role: UserRole) {
  if (role === 'salesperson') return items.map(stripCostPrice);
  return items;
}

export async function listProducts(tenantId: string, filters: ProductFilters) {
  const conditions: any[] = [eq(products.tenantId, tenantId)];

  if (filters.isActive !== undefined) {
    conditions.push(eq(products.isActive, filters.isActive));
  } else {
    conditions.push(eq(products.isActive, true));
  }

  if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));
  if (filters.brandId) conditions.push(eq(products.brandId, filters.brandId));
  if (filters.search) conditions.push(ilike(products.name, `%${filters.search}%`));
  if (filters.updatedAfter) conditions.push(gt(products.updatedAt, new Date(filters.updatedAfter)));

  const limit = Math.min(filters.limit || 20, 100);
  const offset = filters.offset || 0;

  const items = await db
    .select(allColumns)
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return { items, hasMore, offset: offset + items.length };
}

export async function getProductById(tenantId: string, id: string) {
  const [product] = await db
    .select(allColumns)
    .from(products)
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) throw new NotFoundError('Product', id);
  return product;
}

export async function createProduct(
  tenantId: string,
  input: {
    name: string;
    sku: string;
    barcode?: string;
    categoryId: string;
    subTypeId?: string;
    brandId?: string;
    size?: string;
    color?: string;
    hsnCode?: string;
    gstRate?: number;
    sellingPrice: number;
    costPrice?: number;
    mrp?: number;
    catalogDiscountPct?: number;
    minStockLevel?: number;
    reorderPoint?: number;
    description?: string;
    imageUrls?: string[];
  },
) {
  try {
    const barcodeValue = input.barcode || input.sku;

    const [product] = await db
      .insert(products)
      .values({
        tenantId,
        name: input.name,
        sku: input.sku,
        barcode: barcodeValue,
        categoryId: input.categoryId,
        subTypeId: input.subTypeId,
        brandId: input.brandId,
        size: input.size,
        color: input.color,
        hsnCode: input.hsnCode,
        gstRate: String(input.gstRate ?? 5),
        sellingPrice: String(input.sellingPrice),
        costPrice: String(input.costPrice ?? 0),
        mrp: input.mrp ? String(input.mrp) : undefined,
        catalogDiscountPct: String(input.catalogDiscountPct ?? 0),
        minStockLevel: input.minStockLevel ?? 10,
        reorderPoint: input.reorderPoint,
        description: input.description,
        imageUrls: input.imageUrls ?? [],
      })
      .returning(allColumns);

    return product;
  } catch (err: any) {
    if (err.code === '23505') {
      if (err.constraint_name?.includes('sku')) throw new DuplicateEntryError('Product', 'sku');
      if (err.constraint_name?.includes('barcode'))
        throw new DuplicateEntryError('Product', 'barcode');
      throw new DuplicateEntryError('Product', 'unique field');
    }
    throw err;
  }
}

export async function updateProduct(tenantId: string, id: string, patch: Record<string, unknown>) {
  // Convert numeric fields to strings for decimal columns
  const dbPatch: Record<string, unknown> = { ...patch };
  for (const key of ['gstRate', 'sellingPrice', 'costPrice', 'mrp', 'catalogDiscountPct']) {
    if (dbPatch[key] !== undefined && dbPatch[key] !== null) {
      dbPatch[key] = String(dbPatch[key]);
    }
  }

  const [updated] = await db
    .update(products)
    .set(dbPatch)
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
    .returning(allColumns);

  if (!updated) throw new NotFoundError('Product', id);
  return updated;
}

export async function softDeleteProduct(tenantId: string, id: string) {
  const [updated] = await db
    .update(products)
    .set({ isActive: false })
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
    .returning({ id: products.id });

  if (!updated) throw new NotFoundError('Product', id);
  return { id: updated.id, deleted: true };
}

export async function searchProducts(tenantId: string, query: string) {
  if (!query || query.length < 1) return [];

  // Try exact match on barcode or SKU first (fastest path)
  const exactMatches = await db
    .select(allColumns)
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.isActive, true),
        or(eq(products.barcode, query), eq(products.sku, query)),
      ),
    )
    .limit(1);

  if (exactMatches.length > 0) return exactMatches;

  // Fallback to fuzzy name search using trigram similarity (leverages GIN index)
  return db
    .select({
      ...allColumns,
      similarity: sql<number>`similarity(${products.name}, ${query})`.as('similarity'),
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.isActive, true),
        sql`${products.name} % ${query} OR ${products.name} ILIKE ${'%' + query + '%'}`,
      ),
    )
    .orderBy(sql`similarity(${products.name}, ${query}) DESC`)
    .limit(20);
}
