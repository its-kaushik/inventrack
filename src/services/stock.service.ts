import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { products } from '../db/schema/products.js';
import { stockEntries } from '../db/schema/stock-entries.js';
import { NotFoundError } from '../lib/errors.js';

interface StockFilters {
  categoryId?: string;
  status?: 'healthy' | 'low' | 'out';
  limit?: number;
  offset?: number;
}

function getStockStatus(currentStock: number, minStockLevel: number): string {
  if (currentStock <= 0) return 'out';
  if (currentStock <= minStockLevel) return 'low';
  return 'healthy';
}

export async function getStockOverview(tenantId: string, filters: StockFilters) {
  const conditions: any[] = [
    eq(products.tenantId, tenantId),
    eq(products.isActive, true),
  ];

  if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));

  const limit = Math.min(filters.limit || 20, 100);
  const offset = filters.offset || 0;

  const items = await db.select({
    id: products.id,
    name: products.name,
    sku: products.sku,
    barcode: products.barcode,
    categoryId: products.categoryId,
    brandId: products.brandId,
    size: products.size,
    currentStock: products.currentStock,
    minStockLevel: products.minStockLevel,
  }).from(products)
    .where(and(...conditions))
    .orderBy(products.name)
    .limit(limit + 1)
    .offset(offset);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  let result = items.map((p) => ({
    ...p,
    status: getStockStatus(p.currentStock, p.minStockLevel),
  }));

  // Filter by status in-memory (simpler than SQL CASE expression)
  if (filters.status) {
    result = result.filter((p) => p.status === filters.status);
  }

  // Summary counts
  const [summary] = await db.select({
    total: sql<number>`count(*)::int`,
    inStock: sql<number>`count(*) filter (where current_stock > min_stock_level)::int`,
    low: sql<number>`count(*) filter (where current_stock > 0 and current_stock <= min_stock_level)::int`,
    out: sql<number>`count(*) filter (where current_stock <= 0)::int`,
  }).from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));

  return { items: result, summary, hasMore, offset: offset + result.length };
}

export async function getProductStock(tenantId: string, productId: string) {
  const [product] = await db.select({
    id: products.id,
    name: products.name,
    sku: products.sku,
    currentStock: products.currentStock,
    minStockLevel: products.minStockLevel,
  }).from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) throw new NotFoundError('Product', productId);

  return {
    ...product,
    status: getStockStatus(product.currentStock, product.minStockLevel),
  };
}

export async function getStockHistory(tenantId: string, productId: string, limit = 50, offset = 0) {
  const entries = await db.select().from(stockEntries)
    .where(and(eq(stockEntries.tenantId, tenantId), eq(stockEntries.productId, productId)))
    .orderBy(desc(stockEntries.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = entries.length > limit;
  if (hasMore) entries.pop();

  return { entries, hasMore };
}
