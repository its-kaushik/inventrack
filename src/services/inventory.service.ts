import { eq, and, isNull, lte, sql, desc, asc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  productVariants,
  inventoryMovements,
  products,
} from '../db/schema/products.js';
import { tenantSettings } from '../db/schema/tenants.js';
import { updateStockWithRetry } from '../lib/stock-manager.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { enqueueJob } from '../jobs/worker.js';
import type { AdjustmentReason } from '../types/enums.js';

const auditRepo = new AuditRepository(db);

// ──────────────── Stock Adjustment ────────────────

export async function adjustStock(
  tenantId: string,
  userId: string,
  data: {
    variantId: string;
    quantityChange: number;
    reason: AdjustmentReason;
    notes: string;
  },
) {
  return db.transaction(async (tx) => {
    // Fetch current variant
    const [variant] = await tx
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.id, data.variantId), eq(productVariants.tenantId, tenantId)));

    if (!variant) throw new AppError('NOT_FOUND', 'Product variant not found', 404);

    // Update stock with optimistic locking
    const updated = await updateStockWithRetry(
      tx,
      tenantId,
      data.variantId,
      data.quantityChange,
      variant.version,
    );

    // Create inventory movement
    await tx.insert(inventoryMovements).values({
      tenantId,
      variantId: data.variantId,
      movementType: 'adjustment',
      quantity: data.quantityChange,
      referenceType: 'adjustment',
      costPriceAtMovement: variant.weightedAvgCost,
      balanceAfter: updated.availableQuantity,
      notes: `${data.reason}: ${data.notes}`,
      createdBy: userId,
    });

    // Audit log
    await auditRepo.withTransaction(tx).log({
      tenantId,
      userId,
      action: 'stock_adjusted',
      entityType: 'product_variant',
      entityId: data.variantId,
      newValue: {
        change: data.quantityChange,
        reason: data.reason,
        balanceAfter: updated.availableQuantity,
      },
    });

    // Enqueue low stock check
    if (data.quantityChange < 0) {
      await enqueueJob('check-low-stock', { tenantId, variantId: data.variantId });
    }

    return {
      variantId: data.variantId,
      previousQuantity: variant.availableQuantity,
      adjustment: data.quantityChange,
      newQuantity: updated.availableQuantity,
      reason: data.reason,
    };
  });
}

// ──────────────── Stock Movement History ────────────────

export async function getMovementHistory(
  tenantId: string,
  variantId: string,
  opts?: { from?: Date; to?: Date; page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(inventoryMovements.tenantId, tenantId),
    eq(inventoryMovements.variantId, variantId),
  ];

  if (opts?.from) {
    conditions.push(sql`${inventoryMovements.createdAt} >= ${opts.from}`);
  }
  if (opts?.to) {
    conditions.push(sql`${inventoryMovements.createdAt} <= ${opts.to}`);
  }

  const where = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(inventoryMovements)
      .where(where)
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(inventoryMovements).where(where),
  ]);

  return { data, total: totalResult[0]?.total ?? 0, page, limit };
}

// ──────────────── Low Stock Report ────────────────

export async function getLowStockItems(tenantId: string) {
  return db
    .select({
      variantId: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      availableQuantity: productVariants.availableQuantity,
      lowStockThreshold: productVariants.lowStockThreshold,
      mrp: productVariants.mrp,
      productName: products.name,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(productVariants.tenantId, tenantId),
        eq(productVariants.isActive, true),
        sql`${productVariants.lowStockThreshold} IS NOT NULL`,
        sql`${productVariants.availableQuantity} <= ${productVariants.lowStockThreshold}`,
        isNull(products.deletedAt),
        eq(products.isArchived, false),
      ),
    )
    .orderBy(asc(productVariants.availableQuantity));
}

// ──────────────── Shelf Aging ────────────────

export async function getAgingItems(tenantId: string, thresholdDaysOverride?: number) {
  // Get threshold from tenant settings if not overridden
  let thresholdDays = thresholdDaysOverride;
  if (!thresholdDays) {
    const [settings] = await db
      .select({ shelfAgingThresholdDays: tenantSettings.shelfAgingThresholdDays })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId));
    thresholdDays = settings?.shelfAgingThresholdDays ?? 90;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);
  const cutoffDateStr = cutoffDate.toISOString();

  // Find variants where the oldest unconsumed purchase is older than threshold
  return db.execute(sql`
    SELECT
      pv.id as variant_id,
      pv.product_id,
      pv.sku,
      pv.available_quantity,
      pv.weighted_avg_cost,
      pv.mrp,
      p.name as product_name,
      MIN(im.created_at) as oldest_stock_date,
      EXTRACT(DAY FROM NOW() - MIN(im.created_at))::int as age_days
    FROM product_variants pv
    INNER JOIN products p ON pv.product_id = p.id
    INNER JOIN inventory_movements im ON im.variant_id = pv.id
      AND im.movement_type IN ('purchase', 'opening_balance')
    WHERE pv.tenant_id = ${tenantId}
      AND pv.is_active = true
      AND pv.available_quantity > 0
      AND p.deleted_at IS NULL
      AND p.is_archived = false
    GROUP BY pv.id, pv.product_id, pv.sku, pv.available_quantity, pv.weighted_avg_cost, pv.mrp, p.name
    HAVING MIN(im.created_at) < ${cutoffDateStr}::timestamptz
    ORDER BY MIN(im.created_at) ASC
  `);
}

// ──────────────── Stock Levels (Inventory Report) ────────────────

export async function getStockLevels(
  tenantId: string,
  opts?: { search?: string; page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(productVariants.tenantId, tenantId),
    eq(productVariants.isActive, true),
    isNull(products.deletedAt),
    eq(products.isArchived, false),
  ];

  const where = and(...conditions);

  const data = await db
    .select({
      variantId: productVariants.id,
      productId: productVariants.productId,
      productName: products.name,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      availableQuantity: productVariants.availableQuantity,
      reservedQuantity: productVariants.reservedQuantity,
      weightedAvgCost: productVariants.weightedAvgCost,
      mrp: productVariants.mrp,
      costPrice: productVariants.costPrice,
      lowStockThreshold: productVariants.lowStockThreshold,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where)
    .orderBy(asc(products.name), asc(productVariants.sku))
    .limit(limit)
    .offset(offset);

  const [totalResult] = await db
    .select({ total: count() })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where);

  return { data, total: totalResult?.total ?? 0, page, limit };
}

// ──────────────── Physical Stock Count ────────────────

export async function submitStockCount(
  tenantId: string,
  userId: string,
  counts: Array<{ variantId: string; actualCount: number }>,
  autoAdjust: boolean = false,
) {
  const results: Array<{
    variantId: string;
    sku: string;
    expectedCount: number;
    actualCount: number;
    variance: number;
    adjusted: boolean;
  }> = [];

  for (const entry of counts) {
    const [variant] = await db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        availableQuantity: productVariants.availableQuantity,
        version: productVariants.version,
      })
      .from(productVariants)
      .where(and(eq(productVariants.id, entry.variantId), eq(productVariants.tenantId, tenantId)));

    if (!variant) continue;

    const variance = entry.actualCount - variant.availableQuantity;
    let adjusted = false;

    if (variance !== 0 && autoAdjust) {
      await adjustStock(tenantId, userId, {
        variantId: entry.variantId,
        quantityChange: variance,
        reason: 'count_correction',
        notes: `Physical count: expected ${variant.availableQuantity}, actual ${entry.actualCount}`,
      });
      adjusted = true;
    }

    results.push({
      variantId: variant.id,
      sku: variant.sku,
      expectedCount: variant.availableQuantity,
      actualCount: entry.actualCount,
      variance,
      adjusted,
    });
  }

  await auditRepo.log({
    tenantId,
    userId,
    action: 'stock_count_submitted',
    entityType: 'inventory',
    metadata: {
      totalItems: counts.length,
      discrepancies: results.filter((r) => r.variance !== 0).length,
      autoAdjusted: autoAdjust,
    },
  });

  return {
    totalCounted: results.length,
    discrepancies: results.filter((r) => r.variance !== 0).length,
    items: results,
  };
}
