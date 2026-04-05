import { eq, and, sql, gt, isNull, asc, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sales, saleItems } from '../db/schema/sales.js';
import { productVariants, products, inventoryMovements } from '../db/schema/products.js';
import { customers } from '../db/schema/customers.js';
import { suppliers } from '../db/schema/suppliers.js';
import { syncConflicts } from '../db/schema/sync.js';
import { goodsReceipts } from '../db/schema/purchases.js';
import { tenantSettings } from '../db/schema/tenants.js';

function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function monthStart(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function lastMonthStart(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function lastMonthEnd(): string {
  const d = new Date();
  d.setDate(0); // last day of previous month
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export async function getDashboard(tenantId: string) {
  const todayStr = todayStart();
  const mtdStr = monthStart();
  const lastMStart = lastMonthStart();
  const lastMEnd = lastMonthEnd();

  // 1. Today's sales
  const [todaySales] = await db.execute(sql`
    SELECT
      COALESCE(COUNT(*), 0)::int as transaction_count,
      COALESCE(SUM(net_payable::numeric), 0) as total_revenue,
      CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(net_payable::numeric) / COUNT(*), 2) ELSE 0 END as avg_value
    FROM sales
    WHERE tenant_id = ${tenantId}
      AND status = 'completed'
      AND created_at >= ${todayStr}::timestamptz
  `);

  // 2. MTD sales
  const [mtdSales] = await db.execute(sql`
    SELECT COALESCE(SUM(net_payable::numeric), 0) as total_revenue
    FROM sales
    WHERE tenant_id = ${tenantId}
      AND status = 'completed'
      AND created_at >= ${mtdStr}::timestamptz
  `);

  // 3. Last month sales (for comparison)
  const [lastMonthSales] = await db.execute(sql`
    SELECT COALESCE(SUM(net_payable::numeric), 0) as total_revenue
    FROM sales
    WHERE tenant_id = ${tenantId}
      AND status = 'completed'
      AND created_at >= ${lastMStart}::timestamptz
      AND created_at <= ${lastMEnd}::timestamptz
  `);

  // 4. Low stock count
  const [lowStock] = await db.execute(sql`
    SELECT COUNT(*)::int as count
    FROM product_variants pv
    INNER JOIN products p ON pv.product_id = p.id
    WHERE pv.tenant_id = ${tenantId}
      AND pv.is_active = true
      AND pv.low_stock_threshold IS NOT NULL
      AND pv.available_quantity <= pv.low_stock_threshold
      AND p.deleted_at IS NULL
      AND p.is_archived = false
  `);

  // 5. Aging alerts count
  const [settings] = await db
    .select({ threshold: tenantSettings.shelfAgingThresholdDays })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));

  const thresholdDays = settings?.threshold ?? 90;
  const agingCutoff = new Date();
  agingCutoff.setDate(agingCutoff.getDate() - thresholdDays);

  const [agingCount] = await db.execute(sql`
    SELECT COUNT(DISTINCT pv.id)::int as count
    FROM product_variants pv
    INNER JOIN products p ON pv.product_id = p.id
    INNER JOIN inventory_movements im ON im.variant_id = pv.id
      AND im.movement_type IN ('purchase', 'opening_balance')
    WHERE pv.tenant_id = ${tenantId}
      AND pv.is_active = true
      AND pv.available_quantity > 0
      AND p.deleted_at IS NULL
      AND p.is_archived = false
    GROUP BY pv.id
    HAVING MIN(im.created_at) < ${agingCutoff.toISOString()}::timestamptz
  `);

  // 6. Credit summary
  const [receivable] = await db.execute(sql`
    SELECT COALESCE(SUM(outstanding_balance::numeric), 0) as total
    FROM customers
    WHERE tenant_id = ${tenantId}
      AND deleted_at IS NULL
      AND outstanding_balance::numeric > 0
  `);

  const [payable] = await db.execute(sql`
    SELECT COALESCE(SUM(outstanding_balance::numeric), 0) as total
    FROM suppliers
    WHERE tenant_id = ${tenantId}
      AND deleted_at IS NULL
      AND outstanding_balance::numeric > 0
  `);

  // 7. Top 5 selling products today
  const topSelling = await db.execute(sql`
    SELECT
      si.product_name,
      SUM(si.quantity)::int as total_qty,
      SUM(si.line_total::numeric) as total_revenue
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.id
    WHERE s.tenant_id = ${tenantId}
      AND s.status = 'completed'
      AND s.created_at >= ${todayStr}::timestamptz
    GROUP BY si.product_name
    ORDER BY total_qty DESC
    LIMIT 5
  `);

  // 8. Unresolved sync conflicts count
  const [conflictCount] = await db.execute(sql`
    SELECT COUNT(*)::int as count
    FROM sync_conflicts
    WHERE tenant_id = ${tenantId}
      AND status = 'unresolved'
  `);

  return {
    todaySales: {
      transactionCount: Number((todaySales as any).transaction_count ?? 0),
      totalRevenue: Number((todaySales as any).total_revenue ?? 0),
      avgValue: Number((todaySales as any).avg_value ?? 0),
    },
    mtdRevenue: Number((mtdSales as any).total_revenue ?? 0),
    lastMonthRevenue: Number((lastMonthSales as any).total_revenue ?? 0),
    lowStockCount: Number((lowStock as any).count ?? 0),
    agingAlertsCount: (agingCount as any)?.count ? Number((agingCount as any).count) : 0,
    credit: {
      totalReceivable: Number((receivable as any).total ?? 0),
      totalPayable: Number((payable as any).total ?? 0),
    },
    topSellingToday: (topSelling as any[]).map((r: any) => ({
      productName: r.product_name,
      totalQty: Number(r.total_qty),
      totalRevenue: Number(r.total_revenue),
    })),
    syncStatus: {
      unresolvedConflicts: Number((conflictCount as any).count ?? 0),
    },
  };
}

// ──────────────── Inventory Reports (M14) ────────────────

export async function getCurrentStock(
  tenantId: string,
  opts?: { page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

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
      lowStockThreshold: productVariants.lowStockThreshold,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(productVariants.tenantId, tenantId),
        eq(productVariants.isActive, true),
        isNull(products.deletedAt),
        eq(products.isArchived, false),
      ),
    )
    .orderBy(asc(products.name), asc(productVariants.sku))
    .limit(limit)
    .offset(offset);

  const [totalResult] = await db
    .select({ total: count() })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(productVariants.tenantId, tenantId),
        eq(productVariants.isActive, true),
        isNull(products.deletedAt),
        eq(products.isArchived, false),
      ),
    );

  // Add computed values
  const enriched = data.map((row) => ({
    ...row,
    stockValueAtCost: Number(row.weightedAvgCost) * row.availableQuantity,
    stockValueAtMrp: Number(row.mrp) * row.availableQuantity,
  }));

  return { data: enriched, total: totalResult?.total ?? 0, page, limit };
}

export async function getInventoryValuation(tenantId: string) {
  const [result] = await db.execute(sql`
    SELECT
      COUNT(pv.id)::int as total_variants,
      COALESCE(SUM(pv.available_quantity), 0)::int as total_units,
      COALESCE(SUM(pv.available_quantity * pv.weighted_avg_cost::numeric), 0) as value_at_cost,
      COALESCE(SUM(pv.available_quantity * pv.mrp::numeric), 0) as value_at_mrp
    FROM product_variants pv
    INNER JOIN products p ON pv.product_id = p.id
    WHERE pv.tenant_id = ${tenantId}
      AND pv.is_active = true
      AND p.deleted_at IS NULL
      AND p.is_archived = false
      AND pv.available_quantity > 0
  `);

  return {
    totalVariants: Number((result as any)?.total_variants ?? 0),
    totalUnits: Number((result as any)?.total_units ?? 0),
    valueAtCost: Number((result as any)?.value_at_cost ?? 0),
    valueAtMrp: Number((result as any)?.value_at_mrp ?? 0),
  };
}

export async function getDeadStock(tenantId: string, thresholdDaysOverride?: number) {
  const [settings] = await db
    .select({ threshold: tenantSettings.shelfAgingThresholdDays })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));
  const thresholdDays = thresholdDaysOverride ?? settings?.threshold ?? 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);

  const data = await db.execute(sql`
    SELECT
      pv.id as variant_id,
      pv.product_id,
      pv.sku,
      pv.available_quantity,
      pv.weighted_avg_cost,
      pv.mrp,
      p.name as product_name,
      MIN(im.created_at) as oldest_stock_date,
      EXTRACT(DAY FROM NOW() - MIN(im.created_at))::int as age_days,
      (pv.available_quantity * pv.weighted_avg_cost::numeric) as capital_locked
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
    HAVING MIN(im.created_at) < ${cutoff.toISOString()}::timestamptz
    ORDER BY MIN(im.created_at) ASC
  `);

  return {
    thresholdDays,
    items: (data as any[]).map((r: any) => ({
      variantId: r.variant_id,
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      availableQuantity: Number(r.available_quantity),
      weightedAvgCost: Number(r.weighted_avg_cost),
      mrp: Number(r.mrp),
      ageDays: Number(r.age_days),
      capitalLocked: Number(r.capital_locked),
      oldestStockDate: r.oldest_stock_date,
    })),
  };
}

export async function getLowStockReport(tenantId: string) {
  const data = await db
    .select({
      variantId: productVariants.id,
      productId: productVariants.productId,
      productName: products.name,
      sku: productVariants.sku,
      availableQuantity: productVariants.availableQuantity,
      lowStockThreshold: productVariants.lowStockThreshold,
      mrp: productVariants.mrp,
      weightedAvgCost: productVariants.weightedAvgCost,
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

  return { data, count: data.length };
}

// ──────────────── Purchase Reports (M15) ────────────────

export async function getSupplierPurchases(
  tenantId: string,
  opts?: { from?: string; to?: string },
) {
  const conditions = [`gr.tenant_id = '${tenantId}'`];
  if (opts?.from) conditions.push(`gr.created_at >= '${opts.from}'::timestamptz`);
  if (opts?.to) conditions.push(`gr.created_at <= '${opts.to}'::timestamptz`);

  const data = await db.execute(sql.raw(`
    SELECT
      s.id as supplier_id,
      s.name as supplier_name,
      COUNT(gr.id)::int as receipt_count,
      COALESCE(SUM(gr.total_amount::numeric), 0) as total_purchases,
      s.outstanding_balance::numeric as outstanding_balance
    FROM suppliers s
    LEFT JOIN goods_receipts gr ON gr.supplier_id = s.id AND ${conditions.join(' AND ')}
    WHERE s.tenant_id = '${tenantId}' AND s.deleted_at IS NULL
    GROUP BY s.id, s.name, s.outstanding_balance
    ORDER BY total_purchases DESC
  `));

  return {
    data: (data as any[]).map((r: any) => ({
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      receiptCount: Number(r.receipt_count),
      totalPurchases: Number(r.total_purchases),
      outstandingBalance: Number(r.outstanding_balance),
    })),
  };
}

export async function getPurchaseSummary(
  tenantId: string,
  opts?: { from?: string; to?: string },
) {
  const conditions = [`tenant_id = '${tenantId}'`];
  if (opts?.from) conditions.push(`created_at >= '${opts.from}'::timestamptz`);
  if (opts?.to) conditions.push(`created_at <= '${opts.to}'::timestamptz`);

  const [summary] = await db.execute(sql.raw(`
    SELECT
      COUNT(*)::int as total_receipts,
      COALESCE(SUM(total_amount::numeric), 0) as total_amount,
      COALESCE(SUM(total_gst::numeric), 0) as total_gst,
      COALESCE(SUM(amount_paid::numeric), 0) as total_paid
    FROM goods_receipts
    WHERE ${conditions.join(' AND ')}
  `));

  return {
    totalReceipts: Number((summary as any)?.total_receipts ?? 0),
    totalAmount: Number((summary as any)?.total_amount ?? 0),
    totalGst: Number((summary as any)?.total_gst ?? 0),
    totalPaid: Number((summary as any)?.total_paid ?? 0),
    totalCredit: Number((summary as any)?.total_amount ?? 0) - Number((summary as any)?.total_paid ?? 0),
  };
}
