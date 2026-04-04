import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../config/database.js';
import { redis } from '../config/redis.js';
import { products } from '../db/schema/products.js';
import { stockEntries } from '../db/schema/stock-entries.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

// ======================== TYPES ========================

interface AdjustStockInput {
  productId: string;
  quantityChange: number;
  reason: string;
  notes?: string;
}

interface AuditItem {
  productId: string;
  countedQty: number;
}

interface AuditResultItem {
  productId: string;
  productName: string;
  systemQty: number;
  countedQty: number;
  variance: number;
}

// ======================== ADJUST STOCK ========================

export async function adjustStock(tenantId: string, userId: string, input: AdjustStockInput) {
  const { productId, quantityChange, reason, notes } = input;

  // Verify product exists and belongs to this tenant
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) throw new NotFoundError('Product', productId);

  const [entry] = await db
    .insert(stockEntries)
    .values({
      tenantId,
      productId,
      quantity: quantityChange,
      type: 'adjustment',
      reason: notes ? `${reason}: ${notes}` : reason,
      createdBy: userId,
    })
    .returning();

  return entry;
}

// ======================== SUBMIT AUDIT ========================

export async function submitAudit(tenantId: string, userId: string, items: AuditItem[]) {
  const resultItems: AuditResultItem[] = [];

  for (const item of items) {
    const [product] = await db
      .select({
        id: products.id,
        name: products.name,
        currentStock: products.currentStock,
      })
      .from(products)
      .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)))
      .limit(1);

    if (!product) throw new NotFoundError('Product', item.productId);

    const variance = item.countedQty - product.currentStock;

    resultItems.push({
      productId: product.id,
      productName: product.name,
      systemQty: product.currentStock,
      countedQty: item.countedQty,
      variance,
    });
  }

  const auditId = crypto.randomUUID();

  // Store in Redis if available (TTL 1 hour)
  if (redis) {
    const key = `tenant:${tenantId}:stock-audit:${auditId}`;
    await redis.set(key, JSON.stringify({ userId, items: resultItems }), 'EX', 3600);
  }

  return { auditId, items: resultItems };
}

// ======================== APPROVE AUDIT ========================

export async function approveAudit(tenantId: string, userId: string, auditId: string) {
  if (!redis) {
    throw new ValidationError('Audit approval requires Redis to be available');
  }

  const key = `tenant:${tenantId}:stock-audit:${auditId}`;
  const raw = await redis.get(key);

  if (!raw) throw new NotFoundError('Stock audit', auditId);

  const auditData = JSON.parse(raw) as { userId: string; items: AuditResultItem[] };
  const adjustments: Array<{ productId: string; productName: string; variance: number }> = [];

  await db.transaction(async (tx) => {
    for (const item of auditData.items) {
      if (item.variance === 0) continue;

      await tx.insert(stockEntries).values({
        tenantId,
        productId: item.productId,
        quantity: item.variance,
        type: 'adjustment',
        reason: 'count_correction',
        createdBy: userId,
      });

      adjustments.push({
        productId: item.productId,
        productName: item.productName,
        variance: item.variance,
      });
    }
  });

  // Remove audit data from Redis
  await redis.del(key);

  return {
    auditId,
    adjustmentsApplied: adjustments.length,
    adjustments,
  };
}
