import { eq, and, sql, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sales, saleItems } from '../db/schema/sales.js';
import { productVariants, products } from '../db/schema/products.js';
import { customers } from '../db/schema/customers.js';
import { suppliers } from '../db/schema/suppliers.js';
import { syncConflicts } from '../db/schema/sync.js';
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
