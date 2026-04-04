import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { redis } from '../config/redis.js';
import { bills, billItems, billPayments } from '../db/schema/bills.js';
import { products } from '../db/schema/products.js';
import { customers } from '../db/schema/customers.js';
import { suppliers } from '../db/schema/suppliers.js';
import { cashRegisters, cashRegisterEntries } from '../db/schema/cash-registers.js';
import { ledgerEntries } from '../db/schema/ledger-entries.js';
import { Decimal } from '../lib/money.js';
import type { UserRole } from '../types/enums.js';

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function yesterdayStart(): Date {
  const d = todayStart();
  d.setDate(d.getDate() - 1);
  return d;
}

function nextWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

async function getOwnerDashboard(tenantId: string, userId: string) {
  const today = todayStart();
  const yesterday = yesterdayStart();
  const sevenDaysOut = nextWeek();

  const [
    todaySalesResult,
    yesterdaySalesResult,
    todayProfitResult,
    receivablesResult,
    payablesResult,
    lowStockResult,
    agingResult,
    recentBillsResult,
    paymentSplitResult,
    topSellersResult,
    cashInHandResult,
    paymentsDueResult,
  ] = await Promise.all([
    // Today's sales
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(net_amount AS numeric)), 0) AS total,
             COUNT(*)::int AS count
      FROM bills WHERE tenant_id = ${tenantId} AND status = 'completed' AND created_at >= ${today.toISOString()}
    `),
    // Yesterday's sales
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(net_amount AS numeric)), 0) AS total
      FROM bills WHERE tenant_id = ${tenantId} AND status = 'completed'
        AND created_at >= ${yesterday.toISOString()} AND created_at < ${today.toISOString()}
    `),
    // Today's estimated profit: revenue - COGS
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(bi.line_total AS numeric)), 0)
             - COALESCE(SUM(CAST(bi.cost_price AS numeric) * bi.quantity), 0) AS profit
      FROM bill_items bi
      JOIN bills b ON bi.bill_id = b.id
      WHERE b.tenant_id = ${tenantId} AND b.status = 'completed' AND b.created_at >= ${today.toISOString()}
    `),
    // Outstanding receivables
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(outstanding_balance AS numeric)), 0) AS total
      FROM customers WHERE tenant_id = ${tenantId} AND is_active = true
    `),
    // Outstanding payables
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(outstanding_balance AS numeric)), 0) AS total
      FROM suppliers WHERE tenant_id = ${tenantId} AND is_active = true
    `),
    // Low stock count
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM products WHERE tenant_id = ${tenantId} AND is_active = true AND current_stock <= min_stock_level
    `),
    // Aging inventory count (stock older than 90 days with no sale)
    db.execute(sql`
      SELECT COUNT(DISTINCT p.id)::int AS count
      FROM products p
      WHERE p.tenant_id = ${tenantId} AND p.is_active = true AND p.current_stock > 0
        AND NOT EXISTS (
          SELECT 1 FROM stock_entries se
          WHERE se.product_id = p.id AND se.tenant_id = ${tenantId}
            AND se.type = 'sale' AND se.created_at >= NOW() - INTERVAL '90 days'
        )
    `),
    // Recent bills (last 10)
    db
      .select({
        id: bills.id,
        billNumber: bills.billNumber,
        netAmount: bills.netAmount,
        status: bills.status,
        createdAt: bills.createdAt,
      })
      .from(bills)
      .where(and(eq(bills.tenantId, tenantId), eq(bills.status, 'completed')))
      .orderBy(desc(bills.createdAt))
      .limit(10),
    // Payment mode split today
    db.execute(sql`
      SELECT bp.mode, COALESCE(SUM(CAST(bp.amount AS numeric)), 0) AS total
      FROM bill_payments bp
      JOIN bills b ON bp.bill_id = b.id
      WHERE b.tenant_id = ${tenantId} AND b.status = 'completed' AND b.created_at >= ${today.toISOString()}
      GROUP BY bp.mode
    `),
    // Top selling items this week (by quantity)
    db.execute(sql`
      SELECT bi.product_id, bi.product_name, bi.sku,
             SUM(bi.quantity)::int AS total_qty,
             COALESCE(SUM(CAST(bi.line_total AS numeric)), 0) AS total_revenue
      FROM bill_items bi
      JOIN bills b ON bi.bill_id = b.id
      WHERE b.tenant_id = ${tenantId} AND b.status = 'completed'
        AND b.created_at >= ${today.toISOString()}::timestamp - INTERVAL '7 days'
      GROUP BY bi.product_id, bi.product_name, bi.sku
      ORDER BY total_qty DESC
      LIMIT 10
    `),
    // Cash-in-hand (current open register for this user, or total open registers)
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(cr.opening_balance AS numeric)), 0)
             + COALESCE(SUM((
               SELECT COALESCE(SUM(CAST(cre.amount AS numeric)), 0)
               FROM cash_register_entries cre WHERE cre.register_id = cr.id
             )), 0) AS cash_in_hand
      FROM cash_registers cr
      WHERE cr.tenant_id = ${tenantId} AND cr.status = 'open'
    `),
    // Supplier payments due in next 7 days
    db.execute(sql`
      SELECT s.id, s.name, le.due_date,
             COALESCE(SUM(CAST(le.debit AS numeric) - CAST(le.credit AS numeric)), 0) AS amount
      FROM ledger_entries le
      JOIN suppliers s ON le.party_id = s.id
      WHERE le.tenant_id = ${tenantId} AND le.party_type = 'supplier'
        AND le.due_date IS NOT NULL AND le.due_date <= ${sevenDaysOut.toISOString().slice(0, 10)}
      GROUP BY s.id, s.name, le.due_date
      HAVING SUM(CAST(le.debit AS numeric) - CAST(le.credit AS numeric)) > 0
      ORDER BY le.due_date ASC
      LIMIT 10
    `),
  ]);

  return {
    todaySales: {
      total: Number((todaySalesResult as any)[0]?.total ?? 0),
      count: Number((todaySalesResult as any)[0]?.count ?? 0),
      yesterdayTotal: Number((yesterdaySalesResult as any)[0]?.total ?? 0),
    },
    todayProfit: Number((todayProfitResult as any)[0]?.profit ?? 0),
    cashInHand: Number((cashInHandResult as any)[0]?.cash_in_hand ?? 0),
    outstandingReceivables: Number((receivablesResult as any)[0]?.total ?? 0),
    outstandingPayables: Number((payablesResult as any)[0]?.total ?? 0),
    lowStockCount: Number((lowStockResult as any)[0]?.count ?? 0),
    agingInventoryCount: Number((agingResult as any)[0]?.count ?? 0),
    recentBills: recentBillsResult,
    paymentModeSplit: (paymentSplitResult as any[]).reduce(
      (acc: Record<string, number>, r: any) => {
        acc[r.mode] = Number(r.total);
        return acc;
      },
      {},
    ),
    topSellers: (topSellersResult as any[]).map((r: any) => ({
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      totalQty: Number(r.total_qty),
      totalRevenue: Number(r.total_revenue),
    })),
    supplierPaymentsDue: (paymentsDueResult as any[]).map((r: any) => ({
      supplierId: r.id,
      supplierName: r.name,
      dueDate: r.due_date,
      amount: Number(r.amount),
    })),
  };
}

async function getSalespersonDashboard(tenantId: string, userId: string) {
  const today = todayStart();

  const [mySalesResult, recentMyBillsResult] = await Promise.all([
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(net_amount AS numeric)), 0) AS total, COUNT(*)::int AS count
      FROM bills
      WHERE tenant_id = ${tenantId} AND salesperson_id = ${userId}
        AND status = 'completed' AND created_at >= ${today.toISOString()}
    `),
    db
      .select({
        id: bills.id,
        billNumber: bills.billNumber,
        netAmount: bills.netAmount,
        createdAt: bills.createdAt,
      })
      .from(bills)
      .where(
        and(
          eq(bills.tenantId, tenantId),
          eq(bills.salespersonId, userId),
          eq(bills.status, 'completed'),
        ),
      )
      .orderBy(desc(bills.createdAt))
      .limit(10),
  ]);

  return {
    mySalesToday: {
      total: Number((mySalesResult as any)[0]?.total ?? 0),
      count: Number((mySalesResult as any)[0]?.count ?? 0),
    },
    recentMyBills: recentMyBillsResult,
  };
}

export async function getDashboard(tenantId: string, userId: string, role: UserRole) {
  const cacheKey = `tenant:${tenantId}:dashboard:${role}:${userId}`;

  // Try Redis cache (30s TTL)
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      /* Redis error — skip cache */
    }
  }

  const data =
    role === 'salesperson'
      ? await getSalespersonDashboard(tenantId, userId)
      : await getOwnerDashboard(tenantId, userId);

  // Cache result
  if (redis) {
    try {
      await redis.setex(cacheKey, 30, JSON.stringify(data));
    } catch {
      /* Redis error — skip cache */
    }
  }

  return data;
}
