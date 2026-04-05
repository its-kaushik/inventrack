import { eq, and, sql, gt, isNull, asc, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sales, saleItems } from '../db/schema/sales.js';
import { productVariants, products, inventoryMovements } from '../db/schema/products.js';
import { customers } from '../db/schema/customers.js';
import { suppliers } from '../db/schema/suppliers.js';
import { syncConflicts } from '../db/schema/sync.js';
import { goodsReceipts } from '../db/schema/purchases.js';
import { tenantSettings, tenants } from '../db/schema/tenants.js';
import { expenses } from '../db/schema/expenses.js';
import { customerTransactions } from '../db/schema/customers.js';
import { users } from '../db/schema/users.js';

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

// ──────────────── Sales Reports (M18b) ────────────────

function dateFilter(from?: string, to?: string): string {
  const parts: string[] = [];
  if (from) parts.push(`AND s.created_at >= '${from}'::timestamptz`);
  if (to) parts.push(`AND s.created_at <= '${to}'::timestamptz`);
  return parts.join(' ');
}

export async function getSalesSummary(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  const [result] = await db.execute(sql.raw(`
    SELECT
      COUNT(*)::int as transaction_count,
      COALESCE(SUM(net_payable::numeric), 0) as revenue,
      COALESCE(SUM(total_cogs::numeric), 0) as cogs,
      COALESCE(SUM(net_payable::numeric) - SUM(total_cogs::numeric), 0) as gross_profit,
      CASE WHEN SUM(net_payable::numeric) > 0
        THEN ROUND((SUM(net_payable::numeric) - SUM(total_cogs::numeric)) / SUM(net_payable::numeric) * 100, 2)
        ELSE 0 END as gross_margin_pct
    FROM sales s WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
  `));
  return {
    transactionCount: Number((result as any)?.transaction_count ?? 0),
    revenue: Number((result as any)?.revenue ?? 0),
    cogs: Number((result as any)?.cogs ?? 0),
    grossProfit: Number((result as any)?.gross_profit ?? 0),
    grossMarginPct: Number((result as any)?.gross_margin_pct ?? 0),
  };
}

export async function getSalesByCategory(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  const data = await db.execute(sql.raw(`
    SELECT c.name as category, SUM(si.quantity)::int as qty, COALESCE(SUM(si.line_total::numeric), 0) as revenue
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.id
    LEFT JOIN product_variants pv ON si.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
    GROUP BY c.name ORDER BY revenue DESC
  `));
  return { data: (data as any[]).map((r: any) => ({ category: r.category ?? 'Unknown', qty: Number(r.qty), revenue: Number(r.revenue) })) };
}

export async function getSalesByProduct(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  const data = await db.execute(sql.raw(`
    SELECT si.product_name, SUM(si.quantity)::int as qty,
      COALESCE(SUM(si.line_total::numeric), 0) as revenue,
      COALESCE(SUM(si.cost_at_sale::numeric * si.quantity), 0) as cogs,
      COALESCE(SUM(si.line_total::numeric) - SUM(si.cost_at_sale::numeric * si.quantity), 0) as profit
    FROM sale_items si INNER JOIN sales s ON si.sale_id = s.id
    WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
    GROUP BY si.product_name ORDER BY revenue DESC
  `));
  return { data: (data as any[]).map((r: any) => ({ productName: r.product_name, qty: Number(r.qty), revenue: Number(r.revenue), cogs: Number(r.cogs), profit: Number(r.profit) })) };
}

export async function getSalesByBrand(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  const data = await db.execute(sql.raw(`
    SELECT COALESCE(b.name, 'No Brand') as brand, SUM(si.quantity)::int as qty, COALESCE(SUM(si.line_total::numeric), 0) as revenue
    FROM sale_items si INNER JOIN sales s ON si.sale_id = s.id
    LEFT JOIN product_variants pv ON si.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id LEFT JOIN brands b ON p.brand_id = b.id
    WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
    GROUP BY b.name ORDER BY revenue DESC
  `));
  return { data: (data as any[]).map((r: any) => ({ brand: r.brand, qty: Number(r.qty), revenue: Number(r.revenue) })) };
}

export async function getSalesTrend(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  const data = await db.execute(sql.raw(`
    SELECT DATE(s.created_at) as date, COUNT(*)::int as transactions, COALESCE(SUM(net_payable::numeric), 0) as revenue
    FROM sales s WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
    GROUP BY DATE(s.created_at) ORDER BY date ASC
  `));
  return { data: (data as any[]).map((r: any) => ({ date: r.date, transactions: Number(r.transactions), revenue: Number(r.revenue) })) };
}

// ──────────────── Profit Reports ────────────────

export async function getProfitMargins(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  const data = await db.execute(sql.raw(`
    SELECT si.product_name, si.variant_description as variant,
      ROUND(AVG(si.unit_price::numeric), 2) as avg_selling_price,
      ROUND(AVG(si.cost_at_sale::numeric), 2) as avg_cost,
      ROUND(AVG(si.unit_price::numeric) - AVG(si.cost_at_sale::numeric), 2) as avg_profit,
      CASE WHEN AVG(si.unit_price::numeric) > 0
        THEN ROUND((AVG(si.unit_price::numeric) - AVG(si.cost_at_sale::numeric)) / AVG(si.unit_price::numeric) * 100, 2)
        ELSE 0 END as margin_pct,
      SUM(si.quantity)::int as total_qty
    FROM sale_items si INNER JOIN sales s ON si.sale_id = s.id
    WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
    GROUP BY si.product_name, si.variant_description ORDER BY margin_pct DESC
  `));
  return { data: (data as any[]).map((r: any) => ({ productName: r.product_name, variant: r.variant, avgSellingPrice: Number(r.avg_selling_price), avgCost: Number(r.avg_cost), avgProfit: Number(r.avg_profit), marginPct: Number(r.margin_pct), totalQty: Number(r.total_qty) })) };
}

export async function getPnl(tenantId: string, opts?: { from?: string; to?: string }) {
  const sales = await getSalesSummary(tenantId, opts);

  const expenseConditions = [`tenant_id = '${tenantId}'`, `deleted_at IS NULL`];
  if (opts?.from) expenseConditions.push(`date >= '${opts.from}'`);
  if (opts?.to) expenseConditions.push(`date <= '${opts.to}'`);

  const [expenseResult] = await db.execute(sql.raw(`
    SELECT COALESCE(SUM(amount::numeric), 0) as total_expenses
    FROM expenses WHERE ${expenseConditions.join(' AND ')}
  `));

  const totalExpenses = Number((expenseResult as any)?.total_expenses ?? 0);
  const netProfit = sales.grossProfit - totalExpenses;

  return {
    revenue: sales.revenue,
    cogs: sales.cogs,
    grossProfit: sales.grossProfit,
    grossMarginPct: sales.grossMarginPct,
    totalExpenses,
    netProfit,
    netMarginPct: sales.revenue > 0 ? Math.round((netProfit / sales.revenue) * 10000) / 100 : 0,
  };
}

export async function getDiscountImpact(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  const [result] = await db.execute(sql.raw(`
    SELECT
      COALESCE(SUM(subtotal_mrp::numeric), 0) as total_mrp,
      COALESCE(SUM(product_discount_total::numeric), 0) as product_discounts,
      COALESCE(SUM(bill_discount_amount::numeric), 0) as bill_discounts,
      COALESCE(SUM(bargain_adjustment::numeric), 0) as bargain_adjustments,
      COALESCE(SUM(net_payable::numeric), 0) as actual_revenue
    FROM sales s WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
  `));
  const totalMrp = Number((result as any)?.total_mrp ?? 0);
  const totalDiscounts = Number((result as any)?.product_discounts ?? 0) + Number((result as any)?.bill_discounts ?? 0) + Number((result as any)?.bargain_adjustments ?? 0);
  return {
    totalMrp,
    productDiscounts: Number((result as any)?.product_discounts ?? 0),
    billDiscounts: Number((result as any)?.bill_discounts ?? 0),
    bargainAdjustments: Number((result as any)?.bargain_adjustments ?? 0),
    totalDiscounts,
    actualRevenue: Number((result as any)?.actual_revenue ?? 0),
    discountPctOfMrp: totalMrp > 0 ? Math.round((totalDiscounts / totalMrp) * 10000) / 100 : 0,
  };
}

// ──────────────── Credit Reports ────────────────

export async function getCustomerOutstanding(tenantId: string) {
  const data = await db.execute(sql.raw(`
    SELECT id, name, phone, outstanding_balance::numeric as balance
    FROM customers WHERE tenant_id = '${tenantId}' AND deleted_at IS NULL AND outstanding_balance::numeric > 0
    ORDER BY balance DESC
  `));
  return { data: (data as any[]).map((r: any) => ({ id: r.id, name: r.name, phone: r.phone, balance: Number(r.balance) })) };
}

export async function getSupplierOutstanding(tenantId: string) {
  const data = await db.execute(sql.raw(`
    SELECT id, name, phone, outstanding_balance::numeric as balance
    FROM suppliers WHERE tenant_id = '${tenantId}' AND deleted_at IS NULL AND outstanding_balance::numeric > 0
    ORDER BY balance DESC
  `));
  return { data: (data as any[]).map((r: any) => ({ id: r.id, name: r.name, phone: r.phone, balance: Number(r.balance) })) };
}

export async function getCreditAging(tenantId: string) {
  // Reuse from credit service logic
  const { getCustomerKhataSummary, getSupplierPayablesSummary } = await import('./credit.service.js');
  const customerSummary = await getCustomerKhataSummary(tenantId);
  const supplierSummary = await getSupplierPayablesSummary(tenantId);
  return { customers: customerSummary.aging, suppliers: supplierSummary.aging };
}

export async function getPaymentCollections(tenantId: string, opts?: { from?: string; to?: string }) {
  const conditions = [`ct.tenant_id = '${tenantId}'`, `ct.type = 'payment'`];
  if (opts?.from) conditions.push(`ct.created_at >= '${opts.from}'::timestamptz`);
  if (opts?.to) conditions.push(`ct.created_at <= '${opts.to}'::timestamptz`);

  const data = await db.execute(sql.raw(`
    SELECT ct.customer_id, c.name, c.phone,
      COUNT(*)::int as payment_count,
      COALESCE(SUM(ABS(ct.amount::numeric)), 0) as total_collected
    FROM customer_transactions ct
    INNER JOIN customers c ON ct.customer_id = c.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY ct.customer_id, c.name, c.phone
    ORDER BY total_collected DESC
  `));
  return { data: (data as any[]).map((r: any) => ({ customerId: r.customer_id, name: r.name, phone: r.phone, paymentCount: Number(r.payment_count), totalCollected: Number(r.total_collected) })) };
}

// ──────────────── Staff Reports ────────────────

export async function getStaffActivity(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  // Billing activity
  const billingData = await db.execute(sql.raw(`
    SELECT u.name, u.role, COUNT(*)::int as bills, COALESCE(SUM(s.net_payable::numeric), 0) as revenue
    FROM sales s INNER JOIN users u ON s.billed_by = u.id
    WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
    GROUP BY u.name, u.role ORDER BY revenue DESC
  `));

  // Stock activity (inventory movements by user)
  const stockConditions = [`im.tenant_id = '${tenantId}'`];
  if (opts?.from) stockConditions.push(`im.created_at >= '${opts.from}'::timestamptz`);
  if (opts?.to) stockConditions.push(`im.created_at <= '${opts.to}'::timestamptz`);

  const stockData = await db.execute(sql.raw(`
    SELECT u.name, u.role, COUNT(*)::int as stock_entries
    FROM inventory_movements im INNER JOIN users u ON im.created_by = u.id
    WHERE ${stockConditions.join(' AND ')}
    GROUP BY u.name, u.role ORDER BY stock_entries DESC
  `));

  return {
    billing: (billingData as any[]).map((r: any) => ({ name: r.name, role: r.role, bills: Number(r.bills), revenue: Number(r.revenue) })),
    stock: (stockData as any[]).map((r: any) => ({ name: r.name, role: r.role, stockEntries: Number(r.stock_entries) })),
  };
}

// ──────────────── Expense Report ────────────────

export async function getExpenseSummary(tenantId: string, opts?: { from?: string; to?: string }) {
  const conditions = [`e.tenant_id = '${tenantId}'`, `e.deleted_at IS NULL`];
  if (opts?.from) conditions.push(`e.date >= '${opts.from}'`);
  if (opts?.to) conditions.push(`e.date <= '${opts.to}'`);

  const data = await db.execute(sql.raw(`
    SELECT ec.name as category, COUNT(*)::int as count, COALESCE(SUM(e.amount::numeric), 0) as total
    FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY ec.name ORDER BY total DESC
  `));

  const [totals] = await db.execute(sql.raw(`
    SELECT COALESCE(SUM(amount::numeric), 0) as total
    FROM expenses e WHERE ${conditions.join(' AND ')}
  `));

  return {
    total: Number((totals as any)?.total ?? 0),
    byCategory: (data as any[]).map((r: any) => ({ category: r.category ?? 'Uncategorized', count: Number(r.count), total: Number(r.total) })),
  };
}

// ──────────────── GST Reports ────────────────

export async function getGstSummary(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  const [result] = await db.execute(sql.raw(`
    SELECT
      COALESCE(SUM(subtotal_taxable::numeric), 0) as taxable_turnover,
      COALESCE(SUM(total_cgst::numeric), 0) as total_cgst,
      COALESCE(SUM(total_sgst::numeric), 0) as total_sgst,
      COALESCE(SUM(total_igst::numeric), 0) as total_igst,
      COALESCE(SUM(net_payable::numeric), 0) as total_revenue
    FROM sales s WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
  `));

  const [tenant] = await db.select({ gstScheme: tenants.gstScheme }).from(tenants).where(eq(tenants.id, tenantId));

  return {
    gstScheme: tenant?.gstScheme ?? 'composite',
    taxableTurnover: Number((result as any)?.taxable_turnover ?? 0),
    totalCgst: Number((result as any)?.total_cgst ?? 0),
    totalSgst: Number((result as any)?.total_sgst ?? 0),
    totalIgst: Number((result as any)?.total_igst ?? 0),
    totalRevenue: Number((result as any)?.total_revenue ?? 0),
  };
}

export async function getHsnSummary(tenantId: string, opts?: { from?: string; to?: string }) {
  const df = dateFilter(opts?.from, opts?.to);
  const data = await db.execute(sql.raw(`
    SELECT COALESCE(si.hsn_code, 'N/A') as hsn_code,
      SUM(si.quantity)::int as qty,
      COALESCE(SUM(si.line_total::numeric), 0) as taxable_value,
      COALESCE(SUM(si.cgst_amount::numeric), 0) as cgst,
      COALESCE(SUM(si.sgst_amount::numeric), 0) as sgst,
      COALESCE(SUM(si.igst_amount::numeric), 0) as igst
    FROM sale_items si INNER JOIN sales s ON si.sale_id = s.id
    WHERE s.tenant_id = '${tenantId}' AND s.status = 'completed' ${df}
    GROUP BY si.hsn_code ORDER BY taxable_value DESC
  `));
  return { data: (data as any[]).map((r: any) => ({ hsnCode: r.hsn_code, qty: Number(r.qty), taxableValue: Number(r.taxable_value), cgst: Number(r.cgst), sgst: Number(r.sgst), igst: Number(r.igst) })) };
}
