import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { redis } from '../config/redis.js';
import { bills, billItems, billPayments } from '../db/schema/bills.js';
import { products } from '../db/schema/products.js';
import { customers } from '../db/schema/customers.js';
import { suppliers } from '../db/schema/suppliers.js';
import { cashRegisters, cashRegisterEntries } from '../db/schema/cash-registers.js';
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

async function getOwnerDashboard(tenantId: string, userId: string) {
  const today = todayStart();
  const yesterday = yesterdayStart();

  const [
    todaySalesResult,
    yesterdaySalesResult,
    receivablesResult,
    payablesResult,
    lowStockResult,
    recentBillsResult,
    paymentSplitResult,
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
    // Recent bills (last 10)
    db.select({
      id: bills.id,
      billNumber: bills.billNumber,
      netAmount: bills.netAmount,
      status: bills.status,
      createdAt: bills.createdAt,
    }).from(bills)
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
  ]);

  return {
    todaySales: {
      total: Number((todaySalesResult as any)[0]?.total ?? 0),
      count: Number((todaySalesResult as any)[0]?.count ?? 0),
      yesterdayTotal: Number((yesterdaySalesResult as any)[0]?.total ?? 0),
    },
    outstandingReceivables: Number((receivablesResult as any)[0]?.total ?? 0),
    outstandingPayables: Number((payablesResult as any)[0]?.total ?? 0),
    lowStockCount: Number((lowStockResult as any)[0]?.count ?? 0),
    recentBills: recentBillsResult,
    paymentModeSplit: (paymentSplitResult as any[]).reduce((acc: Record<string, number>, r: any) => {
      acc[r.mode] = Number(r.total);
      return acc;
    }, {}),
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
    db.select({
      id: bills.id,
      billNumber: bills.billNumber,
      netAmount: bills.netAmount,
      createdAt: bills.createdAt,
    }).from(bills)
      .where(and(eq(bills.tenantId, tenantId), eq(bills.salespersonId, userId), eq(bills.status, 'completed')))
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
    } catch { /* Redis error — skip cache */ }
  }

  const data = role === 'salesperson'
    ? await getSalespersonDashboard(tenantId, userId)
    : await getOwnerDashboard(tenantId, userId);

  // Cache result
  if (redis) {
    try {
      await redis.setex(cacheKey, 30, JSON.stringify(data));
    } catch { /* Redis error — skip cache */ }
  }

  return data;
}
